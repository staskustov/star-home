"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
}: {
  points: AccessPoint[];
  canCommand?: boolean;
}) {
  const [rows, setRows] = useState(points);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setRows(points);
  }, [points]);

  async function commandPoint(pointId: string, open: boolean) {
    const previous = rows;
    setRows((current) =>
      current.map((point) =>
        point.id === pointId
          ? { ...point, latch: open ? "OPEN" : "CLOSED", status: open ? "Открыто" : "Закрыто" }
          : point,
      ),
    );
    setNotice(null);
    const result = await runCommand(() =>
      fetch(open ? "/api/access/points" : `/api/access/points/${pointId}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pointId }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) {
      setRows(previous);
    }
    setNotice(commandMessage(result.payload));
  }

  if (rows.length === 0) return null;

  return (
    <div>
      <ul className="grid gap-3">
        {rows.map((point) => {
          const open = point.latch === "OPEN";
          const ready = point.ready !== false;
          const allow = canCommand && ready;
          return (
            <li key={point.id} className="panel px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] text-ink">{point.name}</p>
                  <p className="text-sm text-muted">{point.kind}</p>
                </div>
                <StatusBadge tone={!ready ? "warning" : open ? "success" : "info"}>{point.status ?? (open ? "Открыто" : "Закрыто")}</StatusBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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
      {notice ? (
        <p role="status" className="mt-3 text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
