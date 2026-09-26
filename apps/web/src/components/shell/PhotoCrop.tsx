"use client";

import { useEffect, useRef, useState } from "react";

const box = 280;
const output = 256;

export function PhotoCrop({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (photo: string) => void }) {
  const image = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [src, setSrc] = useState("");

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setSrc(next);
    setReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const picture = new Image();
    picture.onload = () => {
      image.current = picture;
      setReady(true);
    };
    picture.src = next;
    return () => URL.revokeObjectURL(next);
  }, [file]);

  function cover() {
    const picture = image.current;
    if (!picture) return 1;
    return Math.max(box / picture.naturalWidth, box / picture.naturalHeight);
  }

  function clamp(next: { x: number; y: number }, scale: number) {
    const picture = image.current;
    if (!picture) return next;
    const width = picture.naturalWidth * scale;
    const height = picture.naturalHeight * scale;
    const maxX = Math.max(0, (width - box) / 2);
    const maxY = Math.max(0, (height - box) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  function crop() {
    const picture = image.current;
    if (!picture) return;
    const scale = cover() * zoom;
    const canvas = document.createElement("canvas");
    canvas.width = output;
    canvas.height = output;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = output / box;
    const width = picture.naturalWidth * scale * ratio;
    const height = picture.naturalHeight * scale * ratio;
    const left = output / 2 + offset.x * ratio - width / 2;
    const top = output / 2 + offset.y * ratio - height / 2;
    context.fillStyle = "#111";
    context.fillRect(0, 0, output, output);
    context.drawImage(picture, left, top, width, height);
    onDone(canvas.toDataURL("image/jpeg", 0.82));
  }

  const scale = cover() * zoom;
  const picture = image.current;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-5">
      <div role="dialog" aria-labelledby="photo-crop-title" className="panel w-full max-w-sm p-5">
        <h2 id="photo-crop-title" className="text-[19px] tracking-[-0.02em] text-ink">
          Обрезать фото
        </h2>
        <p className="mt-1 text-[13px] text-muted">Перетащите снимок и подберите масштаб.</p>
        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-full border border-line"
          style={{ width: box, height: box, touchAction: "none" }}
          onPointerDown={(event) => {
            (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setOffset(
              clamp(
                { x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y },
                scale,
              ),
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {ready && picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none max-w-none select-none"
              style={{
                width: picture.naturalWidth * scale,
                height: picture.naturalHeight * scale,
                position: "absolute",
                left: box / 2 + offset.x - (picture.naturalWidth * scale) / 2,
                top: box / 2 + offset.y - (picture.naturalHeight * scale) / 2,
              }}
            />
          ) : (
            <p className="grid h-full place-items-center text-[14px] text-muted">Загрузка…</p>
          )}
        </div>
        <label className="mt-4 block text-[13px] text-muted">
          Масштаб
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            className="mt-2 w-full"
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setZoom(next);
              setOffset((current) => clamp(current, cover() * next));
            }}
          />
        </label>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn btn-primary flex-1" disabled={!ready} onClick={crop}>
            Сохранить
          </button>
          <button type="button" className="btn btn-secondary flex-1" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
