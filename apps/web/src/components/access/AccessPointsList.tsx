"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusToast } from "@/components/ui/StatusToast";
import { commandMessage, runCommand } from "@/lib/command";

export type AccessPoint = {
  id: string;
  name: string;
  kind: string;
  latch?: "OPEN" | "CLOSED";
  status?: string;
  ready?: boolean;
};

export function AccessPointsList({
  points,
  canCommand = true,
  compact = false,
}: {
  points: AccessPoint[];
  canCommand?: boolean;
  compact?: boolean;
}) {
  const [rows, setRows] = useState(points);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    setRows(points);
  }, [points]);

  async function commandPoint(pointId: string, open: boolean) {
    const previous = rows;
    const nextStatus = open ? "Открыто" : "Закрыто";
    setRows((current) =>
      current.map((point) =>
        point.id === pointId ? { ...point, latch: open ? "OPEN" : "CLOSED", status: nextStatus } : point,
      ),
    );
    setToast({ text: nextStatus, at: Date.now() });
    const result = await runCommand(() =>
      fetch(open ? "/api/access/points" : `/api/access/points/${pointId}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pointId }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) {
      setRows(previous);
      setToast({ text: commandMessage(result.payload), at: Date.now() });
    }
  }

  if (rows.length === 0) return null;

  return (
    <div>
      <ul className={compact ? "grid gap-2" : "grid gap-3"}>
        {rows.map((point) => {
          const open = point.latch === "OPEN";
          const ready = point.ready !== false;
          const allow = canCommand && ready;
          return (
            <li key={point.id} className={compact ? "panel access-point" : "panel px-5 py-4"}>
              {compact ? (
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-ink">{point.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{point.status ?? (open ? "Открыто" : "Закрыто")}</p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] text-ink">{point.name}</p>
                    <p className="text-sm text-muted">{point.kind}</p>
                  </div>
                  <StatusBadge tone={!ready ? "warning" : open ? "success" : "info"}>{point.status ?? (open ? "Открыто" : "Закрыто")}</StatusBadge>
                </div>
              )}
              <div className={compact ? "flex shrink-0 gap-2" : "mt-3 flex flex-wrap gap-2"}>
                <button type="button" className="btn btn-primary btn-compact" disabled={!allow || open} onClick={() => void commandPoint(point.id, true)}>
                  Открыть
                </button>
                <button type="button" className="btn btn-secondary btn-compact" disabled={!allow || !open} onClick={() => void commandPoint(point.id, false)}>
                  Закрыть
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <StatusToast text={toast?.text ?? null} stamp={toast?.at} />
    </div>
  );
}
