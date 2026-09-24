"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { Tone } from "@/types/domain";

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function CameraBlock({ cameras }: { cameras: { name: string; state: string }[] }) {
  const [open, setOpen] = useState(false);
  if (cameras.length === 0) return null;
  const online = cameras.filter((camera) => toneFor(camera.state) === "success").length;

  return (
    <section aria-label="Камеры" className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="camera-list"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[60px] w-full items-center gap-3 px-5 py-3 text-left"
      >
        <span className="tile-icon">
          <Icon name="camera" className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] tracking-[-0.02em] text-ink">Камеры</span>
          <span className="mt-0.5 block text-[13px] text-muted">
            На связи {online} из {cameras.length}
          </span>
        </span>
        <Icon name="chevron" className={`h-5 w-5 text-muted transition-transform duration-200 ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open ? (
        <ul id="camera-list" className="film fade-in scroll-px-5 pb-5 [&>li:first-child]:ml-5 [&>li:last-child]:mr-5">
          {cameras.map((camera) => {
            const tone = toneFor(camera.state);
            return (
              <li key={camera.name} className="w-[44%] shrink-0 snap-start overflow-hidden rounded-[18px] border border-line/60 sm:w-[31%]">
                <div className="camera-well">
                  <Icon name="camera" className="h-7 w-7" />
                </div>
                <div className="px-3.5 py-3">
                  <p className="truncate text-[15px] text-ink">{camera.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden />
                    {camera.state}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function toneFor(state: string): Tone {
  if (state === "Неисправно") return "danger";
  if (state === "Отключено") return "warning";
  return "success";
}
