"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import type { AccessEvent } from "@/types/domain";

type Point = { id: string; name: string; kind: string; latch?: "OPEN" | "CLOSED"; status?: string; ready?: boolean };

export function AccessPanel({
  place,
  passes,
  events,
  points = [],
  canCreate = true,
}: {
  place: string;
  canCreate?: boolean;
  passes: { id: string; guestName: string; detail: string; vehicle?: string; code?: string; qr?: string }[];
  points?: Point[];
  events: AccessEvent[];
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [detail, setDetail] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState(points);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/access/passes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestName, detail, vehicle }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload, unconfirmed));
      return;
    }
    setGuestName("");
    setDetail("");
    setVehicle("");
    setNotice("Пропуск сохранён.");
    router.refresh();
  }

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

  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Доступ</h1>
      <p className="mt-2 text-[15px] text-muted">{place}</p>
      {rows.length > 0 ? (
        <ul className="mt-8 grid gap-3">
          {rows.map((point) => {
            const open = point.latch === "OPEN";
            const ready = point.ready !== false;
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
                  <button type="button" className="btn btn-primary btn-compact" disabled={!ready || open} onClick={() => void commandPoint(point.id, true)}>
                    Открыть
                  </button>
                  <button type="button" className="btn btn-secondary btn-compact" disabled={!ready || !open} onClick={() => void commandPoint(point.id, false)}>
                    Закрыть
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {canCreate ? (
        <form onSubmit={add} className="mt-8 space-y-3 panel p-5">
          <Field label="Гость" value={guestName} onChange={setGuestName} />
          <Field label="Срок" value={detail} onChange={setDetail} />
          <Field label="Автомобиль" value={vehicle} onChange={setVehicle} />
          <button type="submit" className="btn btn-primary">
            Оформить пропуск
          </button>
          {notice ? <p className="text-sm text-muted">{notice}</p> : null}
        </form>
      ) : (
        <p className="mt-8 text-[15px] text-muted">Пропуск оформляет житель.</p>
      )}
      {!canCreate && notice ? <p className="mt-3 text-sm text-muted">{notice}</p> : null}
      <ul className="mt-6 divide-y divide-line panel">
        {passes.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">Гостей нет.</li>
        ) : (
          passes.map((pass) => (
            <li key={pass.id} className="px-5 py-4">
              <p className="text-[16px] text-ink">{pass.guestName}</p>
              <p className="text-sm text-muted">{pass.detail}</p>
              {pass.vehicle ? <p className="text-sm text-muted">{pass.vehicle}</p> : null}
              {pass.code ? <p className="mt-2 text-[20px] tracking-[0.18em] text-ink">{pass.code}</p> : null}
              {pass.qr ? <div className="mt-3 w-32 bg-white" dangerouslySetInnerHTML={{ __html: pass.qr }} /> : null}
            </li>
          ))
        )}
      </ul>
      <ul className="mt-6 divide-y divide-line panel">
        {events.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">История пуста.</li>
        ) : (
          events.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[16px] text-ink">{item.title}</p>
                <p className="text-sm text-muted">{item.time}</p>
              </div>
              <StatusBadge tone={item.result === "SUCCESS" ? "success" : item.result === "UNCONFIRMED" ? "warning" : "danger"}>
                {item.result === "SUCCESS" ? "Разрешено" : item.result === "UNCONFIRMED" ? "Не подтверждено" : "Отказ"}
              </StatusBadge>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="control mt-2" />
    </label>
  );
}
