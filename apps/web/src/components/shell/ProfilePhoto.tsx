"use client";

import { useRef, useState } from "react";
import { PhotoCrop } from "@/components/shell/PhotoCrop";
import { commandMessage, runCommand } from "@/lib/command";

export function ProfilePhoto({ name, photo }: { name: string; photo: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(photo);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(next: string | null) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/profile/photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo: next }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload, "Не удалось сохранить фото."));
      return;
    }
    setCurrent(typeof result.payload?.photo === "string" ? result.payload.photo : null);
    setFile(null);
    window.dispatchEvent(new Event("star-profile"));
  }

  return (
    <div className="panel mt-8 px-5 py-5">
      <div className="flex items-center gap-4">
        <span className="avatar h-16 w-16 overflow-hidden text-[22px]">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1) || "·"
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] text-ink">Фото</p>
          <p className="mt-0.5 text-[13px] text-muted">Житель добавляет свой снимок. Можно обрезать перед сохранением.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-compact" onClick={() => input.current?.click()}>
          {current ? "Изменить фото" : "Добавить фото"}
        </button>
        {current ? (
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => void save(null)}>
            Удалить
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const next = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (!next) return;
          if (next.size > 8_000_000) {
            setNotice("Слишком большой файл.");
            return;
          }
          setFile(next);
        }}
      />
      {notice ? <p className="mt-3 text-[14px] text-muted">{notice}</p> : null}
      {file ? <PhotoCrop file={file} onCancel={() => setFile(null)} onDone={(photo) => void save(photo)} /> : null}
    </div>
  );
}
