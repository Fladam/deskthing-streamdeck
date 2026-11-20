import React, { useCallback, useEffect, useRef, useState } from "react";
import { DeskThing } from "@deskthing/client";
import { DECK_MSG, type ButtonView, type DeckView, type ServerToClient } from "../shared/types";
import { ButtonFace, PageIndicator } from "./components/ButtonFace";

type Flash = "ok" | "error";

const send = (msg: { type: typeof DECK_MSG; request: string; payload?: unknown }) =>
  DeskThing.send(msg as never);

const DeckButton: React.FC<{
  button: ButtonView | null;
  flash?: Flash;
  onPress: (id: string) => void;
}> = ({ button, flash, onPress }) => {
  const [pressed, setPressed] = useState(false);

  if (!button) return <div className="rounded-2xl bg-neutral-900/40" />;

  const ring =
    flash === "error" ? "ring-4 ring-red-500" : flash === "ok" ? "ring-4 ring-white/70" : "ring-0";

  return (
    <button
      className={`relative rounded-2xl transition-transform duration-75 ${ring} ${
        pressed ? "scale-95 brightness-125" : "scale-100"
      }`}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => {
        setPressed(false);
        onPress(button.id);
      }}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      <ButtonFace button={button} />
    </button>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<DeckView | null>(null);
  const [flashes, setFlashes] = useState<Record<string, Flash>>({});
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<number>();

  useEffect(() => {
    // Dial turns pages; top buttons 1-4 jump to pages 1-4. Back (Escape) is left to DeskThing.
    const overridden = ["wheel", "Digit1", "Digit2", "Digit3", "Digit4"];
    DeskThing.overrideKeys(overridden);

    const offView = DeskThing.on("view", (data) => {
      setView((data as unknown as Extract<ServerToClient, { type: "view" }>).payload);
    });

    const offResult = DeskThing.on("pressResult", (data) => {
      const { buttonId, ok, error } = (data as unknown as Extract<ServerToClient, { type: "pressResult" }>).payload;
      setFlashes((f) => ({ ...f, [buttonId]: ok ? "ok" : "error" }));
      window.setTimeout(() => setFlashes(({ [buttonId]: _, ...rest }) => rest), ok ? 150 : 800);
      if (!ok && error) {
        setError(error);
        window.clearTimeout(errorTimer.current);
        errorTimer.current = window.setTimeout(() => setError(null), 3000);
      }
    });

    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastWheel < 200) return; // one page per dial "click"
      lastWheel = now;
      const delta = (e.deltaY || e.deltaX) > 0 ? 1 : -1;
      send({ type: DECK_MSG, request: "page", payload: { delta } });
    };
    const onKey = (e: KeyboardEvent) => {
      const m = /^Digit([1-4])$/.exec(e.code);
      if (m) send({ type: DECK_MSG, request: "page", payload: { index: Number(m[1]) - 1 } });
    };
    window.addEventListener("wheel", onWheel);
    window.addEventListener("keydown", onKey);

    send({ type: DECK_MSG, request: "getView" });

    return () => {
      offView();
      offResult();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      DeskThing.restoreKeys(overridden);
    };
  }, []);

  const onPress = useCallback((buttonId: string) => {
    send({ type: DECK_MSG, request: "press", payload: { buttonId } });
  }, []);

  if (!view) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center text-neutral-400 text-3xl">
        Connecting…
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black flex flex-col p-3 gap-2 overflow-hidden">
      <div
        className="flex-1 grid gap-3 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${view.rows}, minmax(0, 1fr))`,
        }}
      >
        {view.buttons.map((b, i) => (
          <DeckButton key={b?.id ?? `empty-${i}`} button={b} flash={b ? flashes[b.id] : undefined} onPress={onPress} />
        ))}
      </div>

      <div className="relative h-6 flex items-center justify-center text-neutral-400 text-base">
        {error ? (
          <span className="text-red-400 truncate px-10">{error}</span>
        ) : (
          <PageIndicator name={view.pageName} index={view.pageIndex} count={view.pageCount} />
        )}
        <button
          className="absolute right-0 h-8 w-10 -my-1 flex items-center justify-center text-xl text-neutral-500 active:text-white"
          title="Open the configurator on your PC"
          onClick={() => send({ type: DECK_MSG, request: "openConfigurator" })}
        >
          ⚙
        </button>
      </div>
    </div>
  );
};

export default App;
