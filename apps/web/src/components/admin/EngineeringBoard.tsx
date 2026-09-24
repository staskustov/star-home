"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select } from "@/components/ui/Select";
import { commandMessage, runCommand } from "@/lib/command";
import type { DeviceWork, EngineeringBoard as Board, EngineeringDevice, EngineeringSystem } from "@/types/engineering";

type Notice = { text: string; ok: boolean };

function SystemState({ system }: { system: EngineeringSystem }) {
  if (system.tone === "muted") return <span className="text-[15px] text-muted">{system.state}</span>;
  return <StatusBadge tone={system.tone}>{system.state}</StatusBadge>;
}

function DeviceRow({ device, objectId, board }: { device: EngineeringDevice; objectId: string; board: Board }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const url = `/api/engineering/devices/${encodeURIComponent(device.id)}`;

  async function poll() {
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId }) }));
    setBusy(false);
    setNotice({ text: commandMessage(result.payload), ok: result.ok && result.payload?.confirmed === true });
    router.refresh();
  }

  async function setWork(work: DeviceWork) {
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() => fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId, work }) }));
    setBusy(false);
    if (!result.ok) setNotice({ text: commandMessage(result.payload, "Не удалось сохранить"), ok: false });
    router.refresh();
  }

  const workTone = device.work === "ON" ? "text-muted" : device.work === "FAULT" ? "text-danger" : "text-warning";

  return (
    <li className="py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[16px] text-ink">{device.name}</p>
          <p className="text-[13px] text-muted">
            {device.place} · {device.link}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[16px] tabular-nums text-ink">{device.reading ?? <span className="text-[14px] text-muted">нет показаний</span>}</p>
          {board.can.edit ? null : <p className={`text-[13px] ${workTone}`}>{device.workLabel}</p>}
        </div>
      </div>
      {board.can.edit || board.can.poll ? (
        <div className="mt-3 flex items-center gap-2">
          {board.can.edit ? (
            <Select
              aria-label={`Состояние: ${device.name}`}
              value={device.work}
              disabled={busy}
              onChange={(event) => void setWork(event.target.value as DeviceWork)}
              wrapClassName="min-w-0 flex-1"
              className={workTone}
            >
              {board.works.map((work) => (
                <option key={work.value} value={work.value}>
                  {work.label}
                </option>
              ))}
            </Select>
          ) : null}
          {board.can.poll ? (
            <button type="button" disabled={busy || device.work === "OFF"} onClick={() => void poll()} className="btn btn-secondary btn-compact disabled:opacity-50">
              Опросить
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className={`mt-2 text-[13px] ${notice.ok ? "text-success" : "text-danger"}`}>
          {notice.text}
        </p>
      ) : null}
    </li>
  );
}

export function EngineeringBoard({ board }: { board: Board }) {
  const { selected } = useAdminPreview();
  const current = board.objects.find((object) => object.objectId === selected?.id) ?? board.objects[0];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="kicker text-accent">Системы</p>
      <h1 className="mt-2 text-[36px] leading-none tracking-[-0.04em] text-ink">Инженерия</h1>
      <p className="mt-3 max-w-2xl text-[15px] text-muted">
        Состояние инженерных систем {selected ? `объекта «${selected.name}»` : "объекта"}. Показания приходят только от подключённых устройств; опрос выполняет адаптер.
      </p>

      {!current ? (
        <p className="panel mt-8 p-6 text-[15px] text-muted">Нет доступных объектов.</p>
      ) : (
        <>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {current.systems.map((system) => (
              <section key={system.id} className="panel p-5 sm:p-6" aria-label={system.name}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-[19px] tracking-[-0.02em] text-ink">{system.name}</h2>
                  <SystemState system={system} />
                </div>
                {system.devices.length === 0 ? (
                  <p className="mt-3 text-[14px] text-muted">Устройства этой системы не подключены.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line/50">
                    {system.devices.map((device) => (
                      <DeviceRow key={device.id} device={device} objectId={current.objectId} board={board} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <section className="panel mt-5 p-5 sm:p-6" aria-label="Счётчики">
            <h2 className="text-[19px] tracking-[-0.02em] text-ink">Счётчики</h2>
            {current.meters.length === 0 ? <p className="mt-3 text-[14px] text-muted">Счётчики не подключены.</p> : null}
            <ul className="mt-2 divide-y divide-line/50">
              {current.meters.map((meter) => (
                <li key={meter.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <div>
                    <p className="text-[16px] text-ink">{meter.name}</p>
                    <p className="text-[13px] text-muted">{meter.place}</p>
                  </div>
                  <p className="text-right text-[16px] tabular-nums text-ink">
                    {meter.value === null ? (
                      <span className="text-muted">нет показаний</span>
                    ) : (
                      <>
                        {meter.value} {meter.unit}
                        {meter.at ? <span className="block text-[12px] text-muted">{meter.at}</span> : null}
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
