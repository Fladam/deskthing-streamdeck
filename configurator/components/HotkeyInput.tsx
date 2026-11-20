import React, { useEffect, useRef, useState } from "react";
import { codeToKeyName, isValidKeyName, normalizeCombo } from "../../shared/keys";

/** Hotkey editor: record a combo by pressing it, or type it as "CTRL+SHIFT+S". */
export const HotkeyInput: React.FC<{ keys: string[]; onChange: (keys: string[]) => void }> = ({ keys, onChange }) => {
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState(keys.join("+"));
  const held = useRef(new Set<string>());
  const combo = useRef(new Set<string>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => setText(keys.join("+")), [keys]);

  useEffect(() => {
    if (!recording) return;
    held.current.clear();
    combo.current.clear();
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const name = codeToKeyName(e.code);
      if (!name) return;
      held.current.add(name);
      combo.current.add(name);
    };
    const up = (e: KeyboardEvent) => {
      e.preventDefault();
      const name = codeToKeyName(e.code);
      if (name) held.current.delete(name);
      if (held.current.size === 0 && combo.current.size > 0) {
        onChangeRef.current(normalizeCombo([...combo.current]).slice(0, 6));
        setRecording(false);
      }
    };
    const blur = () => setRecording(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [recording]);

  const parsed = text.split("+").map((k) => k.trim()).filter(Boolean);
  const invalid = parsed.filter((k) => !isValidKeyName(k));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={`field font-mono ${invalid.length ? "border-red-500" : ""}`}
          value={text}
          placeholder="e.g. CTRL+SHIFT+S"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (!invalid.length) onChange(normalizeCombo(parsed).slice(0, 6));
          }}
        />
        <button
          type="button"
          className={`btn shrink-0 ${recording ? "bg-red-700 hover:bg-red-600 animate-pulse" : ""}`}
          onClick={() => setRecording((r) => !r)}
        >
          {recording ? "Press keys…" : "⏺ Record"}
        </button>
      </div>
      {invalid.length > 0 && <p className="text-xs text-red-400">Unknown key: {invalid.join(", ")}</p>}
      <p className="text-xs text-neutral-500">
        Windows-key combos (like WIN+L) get caught by Windows before the browser sees them, so type those instead.
      </p>
    </div>
  );
};
