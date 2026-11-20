import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIMITS, type ButtonConfig, type ObsStatus, type PageConfig, type ProfileConfig } from "../shared/types";
import { api } from "./api";
import { GridEditor } from "./components/GridEditor";
import { Inspector } from "./components/Inspector";
import { ObsBadge, SettingsDialog } from "./components/SettingsDialog";
import { blankButton, blankFolder, blankPage, cloneButton, removeFolderRefs, resizeGrid, type EditorContext } from "./model";

type SaveState = { state: "idle" | "saving" | "saved" | "error"; msg?: string };
type Kind = "page" | "folder";
interface ViewRef {
  kind: Kind;
  index: number;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const keyOf = (v: ViewRef) => `${v.kind}:${v.index}`;
const parseKey = (k: string): ViewRef => {
  const [kind, i] = k.split(":");
  return { kind: kind as Kind, index: Number(i) };
};
const listOf = (p: ProfileConfig, kind: Kind) => (kind === "page" ? p.pages : p.folders ?? []);
const withList = (p: ProfileConfig, kind: Kind, list: PageConfig[]): ProfileConfig =>
  kind === "page" ? { ...p, pages: list } : { ...p, folders: list };

export default function App() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewRef>({ kind: "page", index: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [obsStatus, setObsStatus] = useState<ObsStatus | null>(null);
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

  const refreshObs = useCallback(() => {
    api.obsStatus().then(setObsStatus, () => setObsStatus(null));
  }, []);

  useEffect(() => {
    void load();
    refreshObs();
    const t = setInterval(refreshObs, 3000);
    return () => clearInterval(t);
  }, [load, refreshObs]);

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

  const ctx: EditorContext = useMemo(
    () => ({ pages: profile?.pages ?? [], folders: profile?.folders ?? [], obs: obsStatus }),
    [profile?.pages, profile?.folders, obsStatus]
  );

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-neutral-300">
        <p>Couldn’t reach the StreamDeck app: {loadError}</p>
        <button className="btn" onClick={load}>Retry</button>
      </div>
    );
  }
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Loading…</div>;

  const folders = profile.folders ?? [];
  const current: ViewRef =
    view.kind === "folder" && view.index < folders.length
      ? view
      : { kind: "page", index: Math.min(view.kind === "page" ? view.index : 0, profile.pages.length - 1) };
  const page = listOf(profile, current.kind)[current.index];
  const slots = profile.cols * profile.rows;
  const selectedButton = selected !== null ? page.buttons[selected] ?? null : null;

  const goTo = (v: ViewRef) => {
    setView(v);
    setSelected(null);
  };

  // ---- mutations ----------------------------------------------------------
  const updateView = (target: ViewRef, fn: (buttons: (ButtonConfig | null)[]) => (ButtonConfig | null)[]) =>
    setProfile((p) => {
      if (!p) return p;
      const list = listOf(p, target.kind).map((pg, i) =>
        i === target.index ? { ...pg, buttons: fn(Array.from({ length: slots }, (_, s) => pg.buttons[s] ?? null)) } : pg
      );
      return withList(p, target.kind, list);
    });

  const setSlot = (slot: number, b: ButtonConfig | null, target: ViewRef = current) =>
    updateView(target, (btns) => btns.map((x, i) => (i === slot ? b : x)));

  const addButton = (slot: number) => {
    setSlot(slot, blankButton());
    setSelected(slot);
  };

  const moveButton = (from: number, to: number) => {
    updateView(current, (btns) => {
      const next = [...btns];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setSelected(to);
  };

  const firstFree = (pg: PageConfig) => range(0, slots - 1).find((i) => !pg.buttons[i]);

  const duplicate = (slot: number) => {
    const free = firstFree(page);
    if (free === undefined) return alert("No empty slot here.");
    setSlot(free, cloneButton(page.buttons[slot]!));
    setSelected(free);
  };

  const moveToView = (slot: number, targetKey: string) => {
    const target = parseKey(targetKey);
    const targetPage = listOf(profile, target.kind)[target.index];
    const free = firstFree(targetPage);
    if (free === undefined) return alert(`“${targetPage.name}” is full.`);
    const b = page.buttons[slot]!;
    setSlot(free, b, target);
    setSlot(slot, null);
    setSelected(null);
  };

  const setGrid = (cols: number, rows: number) => {
    const { profile: next, lost } = resizeGrid(profile, cols, rows);
    if (lost > 0 && !confirm(`${lost} button(s) don’t fit in a ${cols}×${rows} grid and will be removed. Continue?`)) return;
    setProfile(next);
    setSelected(null);
  };

  const addView = (kind: Kind) => {
    const list = listOf(profile, kind);
    const max = kind === "page" ? LIMITS.maxPages : LIMITS.maxFolders;
    if (list.length >= max) return;
    const created = kind === "page" ? blankPage(slots, list.length + 1) : blankFolder(slots, list.length + 1);
    setProfile(withList(profile, kind, [...list, created]));
    goTo({ kind, index: list.length });
  };

  const deleteView = (v: ViewRef) => {
    const list = listOf(profile, v.kind);
    if (v.kind === "page" && list.length <= 1) return;
    const target = list[v.index];
    const count = target.buttons.filter(Boolean).length;
    const what = v.kind === "page" ? "page" : "folder";
    const note = v.kind === "folder" ? " Buttons that open it will be set to “None”." : "";
    if (!confirm(`Delete ${what} “${target.name}”${count ? ` and its ${count} button(s)` : ""}?${note}`)) return;
    let next = withList(profile, v.kind, list.filter((_, i) => i !== v.index));
    if (v.kind === "folder") next = removeFolderRefs(next, target.id);
    setProfile(next);
    goTo(v.kind === "page" || list.length > 1 ? { kind: v.kind, index: Math.max(0, v.index - 1) } : { kind: "page", index: 0 });
  };

  const moveView = (v: ViewRef, dir: -1 | 1) => {
    const list = [...listOf(profile, v.kind)];
    const to = v.index + dir;
    if (to < 0 || to >= list.length) return;
    [list[v.index], list[to]] = [list[to], list[v.index]];
    setProfile(withList(profile, v.kind, list));
    setView({ kind: v.kind, index: to });
  };

  const renameView = (v: ViewRef, name: string) =>
    setProfile(withList(profile, v.kind, listOf(profile, v.kind).map((p, i) => (i === v.index ? { ...p, name } : p))));

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
      goTo({ kind: "page", index: 0 });
      setSave({ state: "idle" });
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const moveTargets = [
    ...profile.pages.map((p, i) => ({ key: `page:${i}`, label: `${i + 1}. ${p.name}` })),
    ...folders.map((f, i) => ({ key: `folder:${i}`, label: `📁 ${f.name}` })),
  ];

  // ---- render ---------------------------------------------------------------
  const tab = (v: ViewRef, label: string, name: string) => {
    const k = keyOf(v);
    const active = keyOf(current) === k;
    if (renaming === k) {
      return (
        <input
          key={k}
          autoFocus
          className="field w-36"
          defaultValue={name}
          maxLength={LIMITS.maxLabel}
          onBlur={(e) => {
            renameView(v, e.target.value.trim() || name);
            setRenaming(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRenaming(null);
          }}
        />
      );
    }
    return (
      <button
        key={k}
        className={`px-3 py-1.5 rounded-md text-sm ${active ? "bg-neutral-100 text-neutral-900 font-medium" : "bg-neutral-800 hover:bg-neutral-700"}`}
        onClick={() => goTo(v)}
        onDoubleClick={() => setRenaming(k)}
        title="Double-click to rename"
      >
        {label}
      </button>
    );
  };

  const currentList = listOf(profile, current.kind);

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
        <ObsBadge status={obsStatus} />

        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={() => setShowSettings(true)}>⚙ Settings</button>
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
        <div className="px-5 py-2 bg-red-950 text-red-200 text-sm border-b border-red-900">Save failed: {save.msg}</div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <main className="flex-1 p-5 space-y-4 min-w-0">
          <nav className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-xs uppercase tracking-wide text-neutral-500">Pages</span>
              {profile.pages.map((p, i) => tab({ kind: "page", index: i }, `${i + 1}. ${p.name}`, p.name))}
              <button className="btn" onClick={() => addView("page")}>+ Page</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-xs uppercase tracking-wide text-neutral-500">Folders</span>
              {folders.map((f, i) => tab({ kind: "folder", index: i }, `📁 ${f.name}`, f.name))}
              <button className="btn" onClick={() => addView("folder")} title="Folders are hidden pages opened by a button">+ Folder</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-sm text-neutral-400 mr-auto">
                Editing {current.kind === "folder" ? "folder" : "page"} <b className="text-neutral-200">{page.name}</b>
                {current.kind === "folder" && <span className="text-neutral-500"> · open it with a button set to “Open folder”</span>}
              </span>
              <button className="btn" onClick={() => moveView(current, -1)} disabled={current.index === 0} title="Move left">←</button>
              <button className="btn" onClick={() => moveView(current, 1)} disabled={current.index === currentList.length - 1} title="Move right">→</button>
              <button className="btn" onClick={() => setRenaming(keyOf(current))}>Rename</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteView(current)}
                disabled={current.kind === "page" && profile.pages.length <= 1}
              >
                Delete {current.kind}
              </button>
            </div>
          </nav>

          <GridEditor
            page={page}
            pageIndex={current.kind === "page" ? current.index : 0}
            pageCount={profile.pages.length}
            inFolder={current.kind === "folder"}
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

        <aside className="lg:w-[26rem] shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-800 p-5 overflow-y-auto">
          {selectedButton && selected !== null ? (
            <Inspector
              key={selectedButton.id}
              button={selectedButton}
              ctx={ctx}
              location={keyOf(current)}
              moveTargets={moveTargets}
              onChange={(b) => setSlot(selected, b)}
              onDelete={() => {
                setSlot(selected, null);
                setSelected(null);
              }}
              onDuplicate={() => duplicate(selected)}
              onMove={(k) => moveToView(selected, k)}
            />
          ) : (
            <div className="text-sm text-neutral-500 space-y-2">
              <p>Select a button to edit it, or click an empty slot to add one.</p>
              <p>Changes are applied to the Car Thing when you press <b>Save to device</b>.</p>
            </div>
          )}
        </aside>
      </div>

      {showSettings && (
        <SettingsDialog obsStatus={obsStatus} onClose={() => setShowSettings(false)} onSaved={() => setTimeout(refreshObs, 800)} />
      )}
    </div>
  );
}
