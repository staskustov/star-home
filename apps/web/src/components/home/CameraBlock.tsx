"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { commandMessage, runCommand } from "@/lib/command";
import type { Tone } from "@/types/domain";

type HomeCamera = { id?: string; name: string; state: string; hasFrame?: boolean; scope?: "house" | "project" };

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function CameraBlock({ cameras }: { cameras: HomeCamera[] }) {
  const ordered = [...cameras.filter((item) => item.scope !== "project"), ...cameras.filter((item) => item.scope === "project")];
  const [viewer, setViewer] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [frameAt, setFrameAt] = useState<Record<string, number>>({});
  const camera = viewer !== null ? ordered[viewer] ?? ordered[0] : null;
  const tone = toneFor(camera?.state ?? "");
  const frameStamp = camera?.id ? frameAt[camera.id] : undefined;
  const showFrame = Boolean(camera?.id && (frameStamp || camera.hasFrame));
  const frameSrc = camera?.id && showFrame ? `/api/smart-home/cameras/${camera.id}/frame?t=${frameStamp ?? "last"}` : null;

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const selectedId = viewer === null ? undefined : ordered[viewer]?.id;

  useEffect(() => {
    if (viewer === null) return;
    const current = ordered[viewer];
    if (!current?.id) return;
    void requestFrame(current);
    // Request once per selected camera, not on every cameras array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, selectedId]);

  async function requestFrame(item: HomeCamera) {
    if (!item.id) return;
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/cameras/${item.id}/frame`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    setBusy(false);
    setNotice(commandMessage(result.payload, "Не удалось получить кадр."));
    if (result.ok && (result.payload?.hasFrame === true || result.payload?.confirmed === true)) {
      setFrameAt((current) => ({ ...current, [item.id!]: Date.now() }));
    }
  }

  if (ordered.length === 0) return null;

  const dialog =
    camera && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-[#111] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
            role="dialog"
            aria-modal="true"
            aria-label={camera.name}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-[17px] tracking-[-0.02em] text-[#f7f1e8]">{camera.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#f7f1e8]/70">
                  <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden />
                  {camera.scope === "project" ? "Проект" : "Объект"} · {camera.state}
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-compact shrink-0" onClick={() => setViewer(null)}>
                Закрыть
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-black px-5 text-center">
              {frameSrc ? (
                // Session cookie must follow the JPEG; next/image would drop it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frameSrc} alt={camera.name} className="max-h-full max-w-full object-contain" />
              ) : (
                <>
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-white/8 text-[#f7f1e8]/55">
                    <Icon name="camera" className="h-8 w-8" />
                  </span>
                  <p className="text-[15px] text-[#f7f1e8]/70">{busy ? "Запрашиваем кадр…" : "Видеопоток не подключён"}</p>
                </>
              )}
              {notice ? <p className="text-[13px] text-[#f7f1e8]/70">{notice}</p> : null}
            </div>
            {ordered.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto px-5 py-4" role="list" aria-label="Камеры">
                {ordered.map((item, position) => (
                  <button
                    key={item.id ?? item.name}
                    type="button"
                    role="listitem"
                    aria-pressed={position === viewer}
                    onClick={() => setViewer(position)}
                    className={`shrink-0 rounded-2xl px-3 py-2 text-left text-[13px] ${position === viewer ? "bg-white/16 text-[#f7f1e8]" : "bg-white/8 text-[#f7f1e8]/70"}`}
                  >
                    <span className="block">{item.name}</span>
                    <span className="mt-0.5 block text-[11px] opacity-70">{item.scope === "project" ? "Проект" : "Объект"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-5" />
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section aria-label="Камеры">
        <div className="film">
          {ordered.map((item, index) => (
            <button
              key={item.id ?? item.name}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={viewer === index}
              onClick={() => setViewer(index)}
              className={`panel shrink-0 snap-center overflow-hidden px-4 py-3 text-left ${ordered.length === 1 ? "w-full" : "w-[78%]"}`}
            >
              <span className="flex items-center gap-3">
                <span className="tile-icon">
                  <Icon name="camera" className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
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
      {dialog}
    </>
  );
}

function toneFor(state: string): Tone {
  if (state === "Неисправно" || state === "Нет связи") return "danger";
  if (state === "Отключено" || state === "Не подключена" || state === "Настроена") return "warning";
  if (state === "Есть кадр") return "success";
  return "info";
}
