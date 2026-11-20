import React, { useLayoutEffect, useRef, useState } from "react";
import type { ButtonConfig, PageConfig } from "../../shared/types";
import { ButtonFace, DEVICE_HEIGHT, DEVICE_WIDTH, PageIndicator } from "../../src/components/ButtonFace";
import { describeAction } from "../model";

/** WYSIWYG preview of one page at the Car Thing's 800x480 resolution, scaled to fit. Drag to move/swap. */
export const GridEditor: React.FC<{
  page: PageConfig;
  pageIndex: number;
  pageCount: number;
  inFolder?: boolean;
  cols: number;
  rows: number;
  selected: number | null;
  onSelect: (slot: number) => void;
  onAdd: (slot: number) => void;
  onMove: (from: number, to: number) => void;
}> = ({ page, pageIndex, pageCount, inFolder, cols, rows, selected, onSelect, onAdd, onMove }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1.25, el.clientWidth / DEVICE_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slots: (ButtonConfig | null)[] = Array.from({ length: cols * rows }, (_, i) => page.buttons[i] ?? null);

  return (
    <div ref={wrapRef} className="w-full">
      <div style={{ width: DEVICE_WIDTH * scale, height: DEVICE_HEIGHT * scale }} className="mx-auto">
        <div
          className="bg-black rounded-xl shadow-2xl ring-1 ring-neutral-800 flex flex-col p-3 origin-top-left"
          style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT, transform: `scale(${scale})` }}
        >
          <div
            className="flex-1 grid gap-3 min-h-0 mb-2"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {slots.map((b, i) => {
              const isSel = selected === i;
              const isOver = dragOver === i && dragFrom !== i;
              const ring = isSel ? "ring-4 ring-sky-500" : isOver ? "ring-4 ring-sky-300/60" : "";
              return (
                <div
                  key={b?.id ?? `empty-${i}`}
                  className={`rounded-2xl ${ring} ${dragFrom === i ? "opacity-40" : ""}`}
                  draggable={!!b}
                  title={b ? describeAction(b.action) : "Add a button"}
                  onClick={() => (b ? onSelect(i) : onAdd(i))}
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    setDragOver(i);
                  }}
                  onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                >
                  {b ? (
                    <div className="w-full h-full cursor-pointer">
                      <ButtonFace button={b} />
                    </div>
                  ) : (
                    <div className="w-full h-full rounded-2xl border-2 border-dashed border-neutral-800 hover:border-neutral-600 flex items-center justify-center text-5xl text-neutral-700 hover:text-neutral-500 cursor-pointer">
                      +
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-6 flex items-center justify-center text-neutral-400 text-base">
            <PageIndicator name={page.name} index={pageIndex} count={pageCount} inFolder={inFolder} />
          </div>
        </div>
      </div>
    </div>
  );
};
