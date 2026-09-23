"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import type { AccessEvent } from "@/types/domain";

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
  points?: { id: string; name: string; kind: string }[];
  events: AccessEvent[];
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [detail, setDetail] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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

  async function openPoint(pointId: string) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/access/points", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pointId }),
      }),
    );
    setNotice(commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Доступ</h1>
      <p className="mt-2 text-[15px] text-muted">{place}</p>
      {points.length > 0 ? (
        <ul className="mt-8 grid gap-3">
          {points.map((point) => (
            <li key={point.id}>
              <button
                type="button"
                onClick={() => openPoint(point.id)}
                className="flex h-[52px] w-full items-center justify-between rounded-[14px] bg-accent px-5 text-left text-[15px] text-accent-contrast"
              >
                <span>{point.name}</span>
                <span className="text-sm opacity-80">{point.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canCreate ? (
        <form onSubmit={add} className="mt-8 space-y-3 rounded-[20px] border border-line bg-surface p-5">
          <Field label="Гость" value={guestName} onChange={setGuestName} />
          <Field label="Срок" value={detail} onChange={setDetail} />
          <Field label="Автомобиль" value={vehicle} onChange={setVehicle} />
          <button type="submit" className="h-12 rounded-[14px] bg-accent px-5 text-sm text-accent-contrast">
            Оформить пропуск
          </button>
          {notice ? <p className="text-sm text-muted">{notice}</p> : null}
        </form>
      ) : (
        <p className="mt-8 text-[15px] text-muted">Пропуск оформляет житель.</p>
      )}
      {!canCreate && notice ? <p className="mt-3 text-sm text-muted">{notice}</p> : null}
      <ul className="mt-6 divide-y divide-line rounded-[20px] border border-line bg-surface">
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
      <ul className="mt-6 divide-y divide-line rounded-[20px] border border-line bg-surface">
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
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
