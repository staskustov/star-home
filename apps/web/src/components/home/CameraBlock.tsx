"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import type { Tone } from "@/types/domain";

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function CameraBlock({ cameras }: { cameras: { name: string; state: string }[] }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const camera = viewer !== null ? cameras[viewer] ?? cameras[0] : null;
  const tone = toneFor(camera?.state ?? "");

  useEffect(() => {
    if (viewer === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setViewer(null);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [viewer]);

  if (cameras.length === 0) return null;
  const online = cameras.filter((item) => toneFor(item.state) === "success").length;

  return (
    <>
      <section aria-label="Камеры" className="panel overflow-hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={viewer !== null}
          onClick={() => setViewer(0)}
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
          <Icon name="chevron" className="h-5 w-5 rotate-90 text-muted" />
        </button>
      </section>
      {camera ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[#111]" role="dialog" aria-modal="true" aria-label={camera.name}>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-[17px] tracking-[-0.02em] text-[#f7f1e8]">{camera.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#f7f1e8]/70">
                <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden />
                {camera.state}
              </p>
            </div>
            <button type="button" className="btn btn-secondary btn-compact shrink-0" onClick={() => setViewer(null)}>
              Закрыть
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-black px-5 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/8 text-[#f7f1e8]/55">
              <Icon name="camera" className="h-8 w-8" />
            </span>
            <p className="text-[15px] text-[#f7f1e8]/70">Видеопоток не подключён</p>
          </div>
          {cameras.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-5 py-4" role="list" aria-label="Камеры">
              {cameras.map((item, position) => (
                <button
                  key={item.name}
                  type="button"
                  role="listitem"
                  aria-pressed={position === viewer}
                  onClick={() => setViewer(position)}
                  className={`shrink-0 rounded-2xl px-3 py-2 text-left text-[13px] ${position === viewer ? "bg-white/16 text-[#f7f1e8]" : "bg-white/8 text-[#f7f1e8]/70"}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="h-5" />
          )}
        </div>
      ) : null}
    </>
  );
}

function toneFor(state: string): Tone {
  if (state === "Неисправно") return "danger";
  if (state === "Отключено") return "warning";
  return "success";
}
