"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { CameraViewer, orderCameras, type HomeCamera } from "@/components/home/CameraViewer";

export function CameraBlock({ cameras }: { cameras: HomeCamera[] }) {
  const ordered = orderCameras(cameras);
  const [viewer, setViewer] = useState<number | null>(null);

  if (ordered.length === 0) return null;

  return (
    <>
      <section aria-label="Камеры" className="w-full">
        <div className="film camera-film">
          {ordered.map((item, index) => (
            <button
              key={item.id ?? item.name}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={viewer === index}
              onClick={() => setViewer(index)}
              className={`panel shrink-0 snap-center overflow-hidden px-4 py-3 text-left camera-tile ${
                ordered.length === 1 ? "w-full md:w-auto" : "w-[78%] md:w-auto"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="tile-icon">
                  <Icon name="camera" className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 md:flex-none">
                  <span className="block truncate text-[17px] tracking-[-0.02em] text-ink">{item.name}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    {item.scope === "project" ? "Проект" : "Объект"}
                    {item.state ? ` · ${item.state}` : ""}
                  </span>
                </span>
                <Icon name="chevron" className="h-4 w-4 shrink-0 rotate-90 text-muted" />
              </span>
            </button>
          ))}
        </div>
      </section>
      {viewer !== null ? (
        <CameraViewer cameras={ordered} index={viewer} onClose={() => setViewer(null)} onSelect={setViewer} />
      ) : null}
    </>
  );
}
