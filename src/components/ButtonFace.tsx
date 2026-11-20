// Pure visual for a deck button. Used by the device UI and the configurator
// preview (which renders at device size and scales down, so they match exactly).
import React from "react";
import type { ButtonView } from "../../shared/types";

export const DEVICE_WIDTH = 800;
export const DEVICE_HEIGHT = 480;

export const ButtonFace: React.FC<{ button: Omit<ButtonView, "id"> }> = ({ button }) => (
  <div
    className="relative w-full h-full flex flex-col items-center justify-center rounded-2xl overflow-hidden select-none"
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
    {button.label && <span className="mt-1 text-xl font-semibold px-2 truncate max-w-full">{button.label}</span>}
    {button.indicator && (
      <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
    )}
  </div>
);

export const PageIndicator: React.FC<{ name: string; index: number; count: number; inFolder?: boolean }> = ({
  name,
  index,
  count,
  inFolder,
}) => (
  <span className="flex items-center">
    <span>{inFolder ? `📁 ${name}` : name}</span>
    {!inFolder && count > 1 && (
      <span className="flex ml-3">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={`w-2 h-2 ml-1.5 first:ml-0 rounded-full ${i === index ? "bg-white" : "bg-neutral-600"}`} />
        ))}
      </span>
    )}
  </span>
);
