"use client";

import { useEffect, useRef, useState } from "react";

export function PhotoCrop({
  file,
  onCancel,
  onDone,
  ratio = 1,
  round = true,
  outputWidth = 256,
}: {
  file: File;
  onCancel: () => void;
  onDone: (photo: string) => void;
  ratio?: number;
  round?: boolean;
  outputWidth?: number;
}) {
  const image = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [src, setSrc] = useState("");
  const boxW = round ? 280 : 255;
  const boxH = Math.round(boxW / ratio);
  const outputH = Math.round(outputWidth / ratio);

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
    return Math.max(boxW / picture.naturalWidth, boxH / picture.naturalHeight);
  }

  function clamp(next: { x: number; y: number }, scale: number) {
    const picture = image.current;
    if (!picture) return next;
    const width = picture.naturalWidth * scale;
    const height = picture.naturalHeight * scale;
    const maxX = Math.max(0, (width - boxW) / 2);
    const maxY = Math.max(0, (height - boxH) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  function crop() {
    const picture = image.current;
    if (!picture) return;
    const scale = cover() * zoom;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputH;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratioX = outputWidth / boxW;
    const ratioY = outputH / boxH;
    const width = picture.naturalWidth * scale * ratioX;
    const height = picture.naturalHeight * scale * ratioY;
    const left = outputWidth / 2 + offset.x * ratioX - width / 2;
    const top = outputH / 2 + offset.y * ratioY - height / 2;
    context.fillStyle = "#111";
    context.fillRect(0, 0, outputWidth, outputH);
    context.drawImage(picture, left, top, width, height);
    onDone(canvas.toDataURL("image/jpeg", 0.74));
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
          className={`relative mx-auto mt-4 overflow-hidden border border-line ${round ? "rounded-full" : "rounded-[28px]"}`}
          style={{ width: boxW, height: boxH, touchAction: "none" }}
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
                left: boxW / 2 + offset.x - (picture.naturalWidth * scale) / 2,
                top: boxH / 2 + offset.y - (picture.naturalHeight * scale) / 2,
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
