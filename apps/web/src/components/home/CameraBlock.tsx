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
  const [index, setIndex] = useState(0);
  if (cameras.length === 0) return null;
  const online = cameras.filter((camera) => toneFor(camera.state) === "success").length;

  function onScroll(event: React.UIEvent<HTMLUListElement>) {
    const target = event.currentTarget;
    const first = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    setIndex(Math.round(target.scrollLeft / (first + 10)));
  }

  return (
    <section aria-label="Камеры" className="panel overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <span className="tile-icon">
          <Icon name="camera" className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] tracking-[-0.02em] text-ink">Камеры</span>
          <span className="mt-0.5 block text-[13px] text-muted">
            На связи {online} из {cameras.length}
          </span>
        </span>
      </div>
      <ul id="camera-list" className="home-camera-film" onScroll={onScroll}>
        {cameras.map((camera) => {
          const tone = toneFor(camera.state);
          return (
            <li key={camera.name} className="home-camera-tile">
              <div className="camera-well">
                <Icon name="camera" className="h-7 w-7" />
                <div className="home-camera-caption">
                  <span className="min-w-0">
                    <p className="truncate text-[15px] leading-tight">{camera.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[12px]">
                      <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden />
                      {camera.state}
                    </p>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {cameras.length > 2 ? (
        <div className="flex justify-center gap-1.5 pb-3" aria-hidden>
          {cameras.map((camera, position) => (
            <span key={camera.name} className={`h-1.5 rounded-full ${position === index ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function toneFor(state: string): Tone {
  if (state === "Неисправно") return "danger";
  if (state === "Отключено") return "warning";
  return "success";
}
