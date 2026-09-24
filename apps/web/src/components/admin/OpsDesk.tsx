"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { commandMessage, runCommand } from "@/lib/command";
import { formatMoney } from "@/lib/format";
import type { AccessEvent } from "@/types/domain";

type Row = { objectId: string };

function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { selected } = useAdminPreview();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">{title}</h1>
      <p className="mt-3 text-[15px] text-muted">{selected?.name ?? "Объект не выбран"}</p>
      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}

function useObjectRows<T extends Row>(rows: T[]): T[] {
  const { selected } = useAdminPreview();
  return rows.filter((row) => row.objectId === selected?.id);
}

export function AccessDesk({
  passes,
  events,
}: {
  passes: { id: string; objectId: string; guestName: string; detail: string; unitName: string }[];
  events: (AccessEvent & { objectId: string })[];
}) {
  const { selected, can } = useAdminPreview();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const guests = useObjectRows(passes);
  const history = useObjectRows(events);

  async function openGate() {
    if (!selected) return;
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/access/gate/object", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id }),
      }),
    );
    setNotice(commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  return (
    <Shell title="Доступ">
      {can("access.gate.open") ? (
        <button type="button" onClick={openGate} className="btn btn-primary">
          Открыть ворота
        </button>
      ) : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      <List empty="Пропусков нет.">
        {guests.map((pass) => (
          <li key={pass.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{pass.guestName}</p>
            <p className="text-sm text-muted">
              {pass.unitName} · {pass.detail}
            </p>
          </li>
        ))}
      </List>
      <List empty="История пуста.">
        {history.map((event) => (
          <li key={event.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-[16px] text-ink">{event.title}</p>
              <p className="text-sm text-muted">{event.time}</p>
            </div>
            <StatusBadge tone={event.result === "SUCCESS" ? "success" : event.result === "UNCONFIRMED" ? "warning" : "danger"}>
              {event.result === "SUCCESS" ? "Разрешено" : event.result === "UNCONFIRMED" ? "Не подтверждено" : "Отказ"}
            </StatusBadge>
          </li>
        ))}
      </List>
    </Shell>
  );
}

const requestStatus: Record<string, string> = {
  CREATED: "Создана",
  ACCEPTED: "Принята",
  ASSIGNED: "Назначена",
  IN_PROGRESS: "В работе",
  WAITING: "Ожидает",
  DONE: "Выполнена",
  CLOSED: "Закрыта",
  NEW: "Создана",
};
const nextStatus: Record<string, string> = {
  CREATED: "ACCEPTED",
  ACCEPTED: "ASSIGNED",
  ASSIGNED: "IN_PROGRESS",
  IN_PROGRESS: "WAITING",
  WAITING: "DONE",
  DONE: "CLOSED",
  NEW: "ACCEPTED",
};

export function RequestDesk({
  requests,
}: {
  requests: { id: string; objectId: string; unitName: string; category: string; text: string; status: string }[];
}) {
  const { selected, can } = useAdminPreview();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const rows = useObjectRows(requests);

  async function move(id: string, status: string) {
    if (!selected) return;
    const result = await runCommand(() =>
      fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, status }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return;
    }
    setNotice("Статус сохранён.");
    router.refresh();
  }

  return (
    <Shell title="Заявки">
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      <List empty="Заявок нет.">
        {rows.map((request) => (
          <li key={request.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{request.category}</p>
            <p className="mt-1 text-sm text-muted">
              {request.unitName} · {request.text}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-graphite">{requestStatus[request.status] ?? request.status}</span>
              {can("service.edit") && nextStatus[request.status] ? (
                <button type="button" onClick={() => move(request.id, nextStatus[request.status])} className="btn btn-secondary btn-compact">
                  Дальше
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </List>
    </Shell>
  );
}

export function PaymentDesk({
  invoices,
}: {
  invoices: { id: string; objectId: string; unitName: string; title: string; amount: number; currency: string; status: "OPEN" | "PAID" }[];
}) {
  const rows = useObjectRows(invoices);
  return (
    <Shell title="Платежи">
      <List empty="Счетов нет.">
        {rows.map((invoice) => (
          <li key={invoice.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-[16px] text-ink">{invoice.title}</p>
              <p className="text-sm text-muted">{invoice.unitName}</p>
            </div>
            <div className="text-right">
              <p className="text-[16px] text-ink">{formatMoney(invoice.amount, invoice.currency)}</p>
              <p className="text-sm text-muted">{invoice.status === "OPEN" ? "Открыт" : "Оплачен"}</p>
            </div>
          </li>
        ))}
      </List>
    </Shell>
  );
}

export function DeviceDesk({
  devices,
  meters = [],
}: {
  devices: { objectId: string; name: string; kind: string; state: string }[];
  meters?: { objectId: string; name: string; value: string; unit: string }[];
}) {
  const rows = useObjectRows(devices);
  const readings = useObjectRows(meters);
  return (
    <Shell title="Устройства">
      <List empty="Устройств нет.">
        {rows.map((device) => (
          <li key={`${device.objectId}-${device.name}`} className="px-5 py-4">
            <p className="text-[16px] text-ink">{device.name}</p>
            <p className="text-sm text-muted">
              {device.kind} · {device.state}
            </p>
          </li>
        ))}
      </List>
      <List empty="Счётчиков нет.">
        {readings.map((meter) => (
          <li key={`${meter.objectId}-${meter.name}`} className="px-5 py-4">
            <p className="text-[16px] text-ink">{meter.name}</p>
            <p className="text-sm text-muted">
              {meter.value} {meter.unit}
            </p>
          </li>
        ))}
      </List>
    </Shell>
  );
}

export function SecurityDesk({
  alarms,
  audit,
  cameras = [],
}: {
  alarms: { id: string; objectId: string; title: string; unitName: string; at: string; status: "OPEN" | "CLOSED" }[];
  audit: { id: string; objectId: string; actor: string; action: string; target: string; result: "SUCCESS" | "ERROR"; error: string; at: string }[];
  cameras?: { objectId: string; name: string; state: string }[];
}) {
  const calls = useObjectRows(alarms);
  const journal = useObjectRows(audit);
  const eyes = useObjectRows(cameras);
  const { selected } = useAdminPreview();
  const [frame, setFrame] = useState<string | null>(null);
  async function shot(name: string) {
    if (!selected) return;
    setFrame(null);
    const result = await runCommand(() =>
      fetch("/api/security/camera", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, name }),
      }),
    );
    setFrame(commandMessage(result.payload));
  }
  return (
    <Shell title="Охрана">
      <List empty="Камер нет.">
        {eyes.map((camera) => (
          <li key={`${camera.objectId}-${camera.name}`} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-[16px] text-ink">{camera.name}</p>
              <p className="text-sm text-muted">{camera.state}</p>
            </div>
            <button type="button" onClick={() => shot(camera.name)} className="btn btn-secondary">
              Кадр
            </button>
          </li>
        ))}
      </List>
      {frame ? <p className="text-sm text-muted">{frame}</p> : null}
      <List empty="Тревог нет.">
        {calls.map((alarm) => (
          <li key={alarm.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{alarm.title}</p>
            <p className="text-sm text-muted">
              {alarm.unitName} · {alarm.at} · {alarm.status === "OPEN" ? "Открыта" : "Закрыта"}
            </p>
          </li>
        ))}
      </List>
      <List empty="Журнал пуст.">
        {journal.map((entry) => (
          <li key={entry.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{entry.action}</p>
            <p className="text-sm text-muted">
              {entry.actor} · {entry.target} · {entry.at} · {entry.result === "SUCCESS" ? "Успех" : "Ошибка"}
              {entry.error ? ` · ${entry.error}` : ""}
            </p>
          </li>
        ))}
      </List>
    </Shell>
  );
}

export function AiDesk({ turns }: { turns: { id: string; objectId: string; prompt: string; reply: string }[] }) {
  const rows = useObjectRows(turns);
  return (
    <Shell title="AI">
      <List empty="Запросов нет.">
        {rows.map((turn) => (
          <li key={turn.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{turn.prompt}</p>
            <p className="mt-1 text-sm text-muted">{turn.reply}</p>
          </li>
        ))}
      </List>
    </Shell>
  );
}

function List({ empty, children }: { empty: string; children: ReactNode }) {
  const list = Array.isArray(children) ? children : [children];
  const filled = list.some(Boolean);
  return (
    <ul className="divide-y divide-line panel">
      {filled ? children : <li className="px-5 py-4 text-[15px] text-muted">{empty}</li>}
    </ul>
  );
}
