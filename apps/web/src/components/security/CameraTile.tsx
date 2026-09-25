"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { commandMessage, runCommand } from "@/lib/command";
import type { SecurityCamera } from "@/types/security";

export function CameraTile({ camera, objectId, large = false }: { camera: SecurityCamera; objectId: string; large?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  async function frame() {
    setBusy(true);
    const result = await runCommand(() =>
      fetch("/api/security/camera", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId, deviceId: camera.id }),
      }),
    );
    setBusy(false);
    setNotice({ text: commandMessage(result.payload), ok: result.ok && result.payload?.confirmed === true });
  }

  const request = (
    <button type="button" disabled={!camera.ready || busy} onClick={() => void frame()} className="btn btn-secondary btn-compact disabled:opacity-50">
      {busy ? "Запрашиваем…" : "Запросить кадр"}
    </button>
  );

  if (!large) {
    return (
      <li className="flex flex-col justify-between gap-4 rounded-2xl border border-line/60 bg-surface-muted/30 p-4">
        <div className="flex items-start gap-3">
          <span className="tile-icon shrink-0" aria-hidden>
            <Icon name="security" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[16px] text-ink">{camera.name}</p>
            <p className="text-[13px] text-muted">{camera.place}</p>
            <p className={`text-[13px] ${camera.ready ? "text-muted" : "text-danger"}`}>{camera.state}</p>
          </div>
        </div>
        <div>
          {request}
          {notice ? <p className={`mt-2 text-[13px] ${notice.ok ? "text-success" : "text-danger"}`}>{notice.text}</p> : null}
        </div>
      </li>
    );
  }

  return (
    <li className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface-muted/20">
      <div className="relative flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 bg-black/35 px-4 text-center">
        <span className={`h-2 w-2 rounded-full ${camera.ready ? "bg-success" : "bg-danger"}`} aria-hidden />
        <p className="text-[14px] text-muted">{camera.ready ? "Видеопоток не подключён" : camera.state}</p>
        {notice ? <p className={`text-[13px] ${notice.ok ? "text-success" : "text-danger"}`}>{notice.text}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] text-ink">{camera.name}</p>
          <p className="truncate text-[12px] text-muted">
            {camera.place} · {camera.state}
          </p>
        </div>
        {request}
      </div>
    </li>
  );
}
