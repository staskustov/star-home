"use client";

import { useRef, useState } from "react";
import { HomeCover } from "@/components/home/HomeCover";
import { PhotoCrop } from "@/components/shell/PhotoCrop";
import { commandMessage, runCommand } from "@/lib/command";

export function HomeCoverEditor({ objectId, photo, canEdit }: { objectId: string; photo: string; canEdit: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState(photo);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(next: string | null) {
    setFile(null);
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/home-cover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo: next, objectId, scope: "object" }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return;
    }
    const body = result.payload as { photo?: string | null };
    setCurrent(typeof body.photo === "string" && body.photo ? body.photo : "/images/house-dusk.jpg");
    setNotice(next ? "Фото объекта сохранено." : "Фото сброшено.");
  }

  return (
    <section className="mt-12">
      <h2 className="text-[24px] tracking-[-0.03em] text-ink">Фото на главной</h2>
      <p className="mt-2 text-[15px] text-muted">Житель может поставить своё фото дома. Это фото объекта, если своего нет.</p>
      <div className="mt-5 overflow-hidden rounded-[28px]">
        <HomeCover photo={current} place="Объект" greeting="Так видит житель" compact />
      </div>
      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => picker.current?.click()}>
            Загрузить фото
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void save(null)}>
            Сбросить
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const next = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              setFile(next);
            }}
          />
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
      {file ? <PhotoCrop file={file} round={false} ratio={3 / 4} outputWidth={720} onCancel={() => setFile(null)} onDone={(photo) => void save(photo)} /> : null}
    </section>
  );
}
