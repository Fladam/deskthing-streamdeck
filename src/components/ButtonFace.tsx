// Pure visual for a deck button. Used by the device UI and the configurator
// preview (which renders at device size and scales down, so they match exactly).
import React from "react";
import type { ButtonView } from "../../shared/types";

export const DEVICE_WIDTH = 800;
export const DEVICE_HEIGHT = 480;

export const ButtonFace: React.FC<{ button: Omit<ButtonView, "id"> }> = ({ button }) => (
  <div
    className="w-full h-full flex flex-col items-center justify-center gap-1 rounded-2xl overflow-hidden select-none"
    style={{ backgroundColor: button.color ?? "#262626", color: button.textColor ?? "#ffffff" }}
  >
    {button.image ? (
      <img
        src={button.image}
        alt=""
        draggable={false}
        className="max-w-[75%] max-h-[62%] object-contain pointer-events-none"
      />
    ) : button.icon ? (
      <span className="text-6xl leading-none">{button.icon}</span>
    ) : null}
    {button.label && <span className="text-xl font-semibold px-2 truncate max-w-full">{button.label}</span>}
  </div>
);

export const PageIndicator: React.FC<{ name: string; index: number; count: number }> = ({ name, index, count }) => (
  <span className="flex items-center gap-3">
    <span>{name}</span>
    {count > 1 && (
      <span className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${i === index ? "bg-white" : "bg-neutral-600"}`} />
        ))}
      </span>
    )}
  </span>
);
