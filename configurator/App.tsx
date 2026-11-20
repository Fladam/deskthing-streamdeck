import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIMITS, type ButtonConfig, type ProfileConfig } from "../shared/types";
import { api } from "./api";
import { GridEditor } from "./components/GridEditor";
import { Inspector } from "./components/Inspector";
import { blankButton, blankPage, cloneButton, resizeGrid } from "./model";

type SaveState = { state: "idle" | "saving" | "saved" | "error"; msg?: string };

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export default function App() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const [renaming, setRenaming] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.getProfile();
      setProfile(p);
      setSavedJson(JSON.stringify(p));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => !!profile && JSON.stringify(profile) !== savedJson, [profile, savedJson]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const doSave = useCallback(async () => {
    if (!profile) return;
    setSave({ state: "saving" });
    try {
      const saved = await api.saveProfile(profile);
      setProfile(saved);
      setSavedJson(JSON.stringify(saved));
      setSave({ state: "saved" });
      setTimeout(() => setSave((s) => (s.state === "saved" ? { state: "idle" } : s)), 2000);
    } catch (e) {
      setSave({ state: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }, [profile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-neutral-300">
        <p>Couldn’t reach the StreamDeck app: {loadError}</p>
        <button className="btn" onClick={load}>Retry</button>
      </div>
    );
  }
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Loading…</div>;

  const page = profile.pages[Math.min(pageIndex, profile.pages.length - 1)];
  const slots = profile.cols * profile.rows;
  const selectedButton = selected !== null ? page.buttons[selected] ?? null : null;

  // ---- mutations ----------------------------------------------------------
  const updatePage = (idx: number, fn: (buttons: (ButtonConfig | null)[]) => (ButtonConfig | null)[]) =>
    setProfile((p) =>
      p && {
        ...p,
        pages: p.pages.map((pg, i) =>
          i === idx ? { ...pg, buttons: fn(Array.from({ length: slots }, (_, s) => pg.buttons[s] ?? null)) } : pg
        ),
      }
    );

  const setSlot = (slot: number, b: ButtonConfig | null) =>
    updatePage(pageIndex, (btns) => btns.map((x, i) => (i === slot ? b : x)));

  const addButton = (slot: number) => {
    setSlot(slot, blankButton());
    setSelected(slot);
  };

  const moveButton = (from: number, to: number) => {
    updatePage(pageIndex, (btns) => {
      const next = [...btns];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setSelected(to);
  };

  const duplicate = (slot: number) => {
    const free = page.buttons.findIndex((b, i) => i < slots && !b);
    const freeSlot = free >= 0 ? free : page.buttons.length < slots ? page.buttons.length : -1;
    if (freeSlot < 0) return alert("No empty slot on this page.");
    setSlot(freeSlot, cloneButton(page.buttons[slot]!));
    setSelected(freeSlot);
  };

  const moveToPage = (slot: number, target: number) => {
    const targetPage = profile.pages[target];
    const free = Array.from({ length: slots }, (_, i) => i).find((i) => !targetPage.buttons[i]);
    if (free === undefined) return alert(`“${targetPage.name}” is full.`);
    const b = page.buttons[slot]!;
    updatePage(target, (btns) => btns.map((x, i) => (i === free ? b : x)));
    setSlot(slot, null);
    setSelected(null);
  };

  const setGrid = (cols: number, rows: number) => {
    const { profile: next, lost } = resizeGrid(profile, cols, rows);
    if (lost > 0 && !confirm(`${lost} button(s) don’t fit in a ${cols}×${rows} grid and will be removed. Continue?`)) return;
    setProfile(next);
    setSelected(null);
  };

  const addPage = () => {
    if (profile.pages.length >= LIMITS.maxPages) return;
    setProfile({ ...profile, pages: [...profile.pages, blankPage(slots, profile.pages.length + 1)] });
    setPageIndex(profile.pages.length);
    setSelected(null);
  };

  const deletePage = (idx: number) => {
    if (profile.pages.length <= 1) return;
    const count = profile.pages[idx].buttons.filter(Boolean).length;
    if (count && !confirm(`Delete “${profile.pages[idx].name}” and its ${count} button(s)?`)) return;
    setProfile({ ...profile, pages: profile.pages.filter((_, i) => i !== idx) });
    setPageIndex((p) => Math.max(0, p >= idx ? p - 1 : p));
    setSelected(null);
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= profile.pages.length) return;
    const pages = [...profile.pages];
    [pages[idx], pages[to]] = [pages[to], pages[idx]];
    setProfile({ ...profile, pages });
    setPageIndex(to);
  };

  const renamePage = (idx: number, name: string) =>
    setProfile({ ...profile, pages: profile.pages.map((p, i) => (i === idx ? { ...p, name } : p)) });

  const exportProfile = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${profile.name.replace(/[^\w-]+/g, "_") || "profile"}.streamdeck.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importProfile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ProfileConfig;
      if (!Array.isArray(data?.pages) || !data.cols || !data.rows) throw new Error("Not a StreamDeck profile file");
      setProfile(data);
      setPageIndex(0);
      setSelected(null);
      setSave({ state: "idle" });
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ---- render ---------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <h1 className="font-semibold text-lg mr-2">StreamDeck</h1>
        <input
          className="field w-48"
          value={profile.name}
          maxLength={LIMITS.maxLabel}
          title="Profile name"
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
        />
        <label className="flex items-center gap-1.5 text-sm text-neutral-400">
          Grid
          <select className="field w-auto" value={profile.cols} onChange={(e) => setGrid(Number(e.target.value), profile.rows)}>
            {range(LIMITS.minCols, LIMITS.maxCols).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          ×
          <select className="field w-auto" value={profile.rows} onChange={(e) => setGrid(profile.cols, Number(e.target.value))}>
            {range(LIMITS.minRows, LIMITS.maxRows).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={() => importRef.current?.click()}>Import</button>
          <button className="btn" onClick={exportProfile}>Export</button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importProfile(f);
            }}
          />
          {dirty && (
            <button
              className="btn"
              onClick={() => {
                setProfile(JSON.parse(savedJson));
                setSelected(null);
                setSave({ state: "idle" });
              }}
            >
              Discard
            </button>
          )}
          <button className="btn btn-primary min-w-28" onClick={doSave} disabled={!dirty || save.state === "saving"}>
            {save.state === "saving" ? "Saving…" : save.state === "saved" && !dirty ? "Saved ✓" : "Save to device"}
          </button>
        </div>
      </header>

      {save.state === "error" && (
        <div className="px-5 py-2 bg-red-950 text-red-200 text-sm border-b border-red-900">
          Save failed: {save.msg}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <main className="flex-1 p-5 space-y-4 min-w-0">
          <nav className="flex flex-wrap items-center gap-1.5">
            {profile.pages.map((p, i) =>
              renaming === i ? (
                <input
                  key={p.id}
                  autoFocus
                  className="field w-36"
                  defaultValue={p.name}
                  maxLength={LIMITS.maxLabel}
                  onBlur={(e) => {
                    renamePage(i, e.target.value.trim() || p.name);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <button
                  key={p.id}
                  className={`px-3 py-1.5 rounded-md text-sm ${
                    i === pageIndex ? "bg-neutral-100 text-neutral-900 font-medium" : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                  onClick={() => {
                    setPageIndex(i);
                    setSelected(null);
                  }}
                  onDoubleClick={() => setRenaming(i)}
                  title="Double-click to rename"
                >
                  {i + 1}. {p.name}
                </button>
              )
            )}
            <button className="btn" onClick={addPage} title="Add page">+ Page</button>
            <span className="ml-auto flex gap-1.5">
              <button className="btn" onClick={() => movePage(pageIndex, -1)} disabled={pageIndex === 0} title="Move page left">←</button>
              <button className="btn" onClick={() => movePage(pageIndex, 1)} disabled={pageIndex === profile.pages.length - 1} title="Move page right">→</button>
              <button className="btn" onClick={() => setRenaming(pageIndex)}>Rename</button>
              <button className="btn btn-danger" onClick={() => deletePage(pageIndex)} disabled={profile.pages.length <= 1}>Delete page</button>
            </span>
          </nav>

          <GridEditor
            page={page}
            pageIndex={pageIndex}
            pageCount={profile.pages.length}
            cols={profile.cols}
            rows={profile.rows}
            selected={selected}
            onSelect={setSelected}
            onAdd={addButton}
            onMove={moveButton}
          />
          <p className="text-center text-xs text-neutral-500">
            Click + to add a button · click a button to edit · drag to move or swap · Ctrl+S to save
          </p>
        </main>

        <aside className="lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-800 p-5 overflow-y-auto">
          {selectedButton && selected !== null ? (
            <Inspector
              key={selectedButton.id}
              button={selectedButton}
              pages={profile.pages}
              pageIndex={pageIndex}
              onChange={(b) => setSlot(selected, b)}
              onDelete={() => {
                setSlot(selected, null);
                setSelected(null);
              }}
              onDuplicate={() => duplicate(selected)}
              onMoveToPage={(t) => moveToPage(selected, t)}
            />
          ) : (
            <div className="text-sm text-neutral-500 space-y-2">
              <p>Select a button to edit it, or click an empty slot to add one.</p>
              <p>Changes are applied to the Car Thing when you press <b>Save to device</b>.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
