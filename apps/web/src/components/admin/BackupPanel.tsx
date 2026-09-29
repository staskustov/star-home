"use client";

import { useState } from "react";
import { commandMessage, runCommand } from "@/lib/command";

export function BackupPanel({ canBackup, canRestore }: { canBackup: boolean; canRestore: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/backup", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setNotice(payload?.message ?? "Не удалось выгрузить снимок.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "star-home-backup.json";
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Снимок скачан. Файл содержит секреты — храните его закрыто.");
    } catch {
      setNotice("Не удалось выгрузить снимок.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File) {
    if (!window.confirm("Восстановить снимок? Текущие данные компании будут заменены. На живом контуре это работает только при STAR_HOME_ALLOW_RESTORE=1.")) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = await runCommand(() =>
        fetch("/api/admin/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirm: "RESTORE", backup: parsed }),
        }),
      );
      setNotice(result.ok ? "Снимок восстановлен." : commandMessage(result.payload, "Восстановление выключено на этом контуре."));
    } catch {
      setNotice("Файл снимка не читается.");
    } finally {
      setBusy(false);
    }
  }

  if (!canBackup && !canRestore) return null;

  return (
    <section className="panel mt-6 grid gap-3 p-5">
      <p className="text-[16px] text-ink">Снимок платформы</p>
      <p className="text-[13px] text-muted">
        JSON-снимки — источник истины. Выгрузка нужна для backup. Восстановление на живом контуре выключено, пока не задан STAR_HOME_ALLOW_RESTORE=1.
      </p>
      {canBackup ? (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void download()}>
          Скачать снимок
        </button>
      ) : null}
      {canRestore ? (
        <label className="text-[13px] text-muted">
          Восстановить из файла
          <input
            type="file"
            accept="application/json"
            className="mt-2 block"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
      {notice ? <p className="text-[13px] text-muted">{notice}</p> : null}
    </section>
  );
}
