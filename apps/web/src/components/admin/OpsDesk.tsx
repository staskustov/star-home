"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ViewToggle, useViewMode } from "@/components/ui/ViewToggle";
import { commandMessage, runCommand } from "@/lib/command";
import { formatMoney } from "@/lib/format";
import type { AccessEvent } from "@/types/domain";

type AccessPointRow = {
  id: string;
  objectId: string;
  name: string;
  endpoint: string;
  latch: "OPEN" | "CLOSED";
  work: "ON" | "OFF" | "FAULT";
  status: string;
};

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
  points = [],
}: {
  passes: { id: string; objectId: string; guestName: string; detail: string; unitName: string }[];
  events: (AccessEvent & { objectId: string })[];
  points?: AccessPointRow[];
}) {
  const { selected, can } = useAdminPreview();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [api, setApi] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const guests = useObjectRows(passes);
  const history = useObjectRows(events);
  const rows = useObjectRows(points);

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

  async function commandPoint(pointId: string, action: "open" | "close") {
    if (!selected) return;
    setNotice(null);
    const url = action === "open" ? "/api/security/points" : `/api/access/object-points/${pointId}/close`;
    const result = await runCommand(() =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, pointId }),
      }),
    );
    setNotice(commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  async function addPoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/access/object-points", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, name, api }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return;
    }
    setName("");
    setApi("");
    setNotice("Точка доступа сохранена.");
    router.refresh();
  }

  async function savePoint(point: AccessPointRow, draft: { name: string; api: string }) {
    if (!selected) return false;
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/access/object-points/${point.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, name: draft.name, api: draft.api }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return false;
    }
    setEditingId(null);
    setNotice("Точка доступа сохранена.");
    router.refresh();
    return true;
  }

  async function removePoint(pointId: string) {
    if (!selected) return;
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/access/object-points/${pointId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return;
    }
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <Shell title="Доступ">
      {can("access.gate.open") ? (
        <button type="button" onClick={openGate} className="btn btn-primary">
          Открыть ворота
        </button>
      ) : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      {can("access.points.manage") ? (
        <form onSubmit={addPoint} className="panel p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-muted">Название</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Api</span>
              <input value={api} onChange={(event) => setApi(event.target.value)} className="control mt-2" placeholder="https://" />
            </label>
          </div>
          <button type="submit" className="mt-5 btn btn-primary">
            Добавить точку доступа
          </button>
        </form>
      ) : null}
      <List empty="Точек доступа нет.">
        {rows.map((point) =>
          editingId === point.id ? (
            <AccessPointEdit
              key={point.id}
              point={point}
              onCancel={() => setEditingId(null)}
              onSave={(draft) => savePoint(point, draft)}
            />
          ) : (
            <li key={point.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] text-ink">{point.name}</p>
                  <p className="mt-1 text-sm text-muted">{point.endpoint || "Локальный адаптер"}</p>
                </div>
                <StatusBadge tone={point.work === "FAULT" ? "danger" : point.work === "OFF" ? "warning" : point.latch === "OPEN" ? "success" : "info"}>
                  {point.status}
                </StatusBadge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {can("access.gate.open") ? (
                  <>
                    <button type="button" className="btn btn-primary btn-compact" onClick={() => commandPoint(point.id, "open")} disabled={point.work !== "ON"}>
                      Открыть
                    </button>
                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => commandPoint(point.id, "close")} disabled={point.work !== "ON"}>
                      Закрыть
                    </button>
                  </>
                ) : null}
                {can("access.points.manage") ? (
                  <>
                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => setEditingId(point.id)}>
                      Изменить
                    </button>
                    <button
                      type="button"
                      className={`btn btn-compact ${pendingDelete === point.id ? "btn-danger" : "btn-secondary"}`}
                      onClick={() => (pendingDelete === point.id ? removePoint(point.id) : setPendingDelete(point.id))}
                    >
                      {pendingDelete === point.id ? "Подтвердить" : "Удалить"}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ),
        )}
      </List>
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

type DeskDevice = {
  id?: string;
  objectId: string;
  name: string;
  kind: string;
  state: string;
  availability?: string;
  lastSeen?: string | null;
  adapter?: string;
  gatewayName?: string | null;
  lastError?: string | null;
};

export function DeviceDesk({
  devices,
  meters = [],
  gateways = [],
  canCommand = false,
}: {
  devices: DeskDevice[];
  meters?: { objectId: string; name: string; value: string; unit: string }[];
  gateways?: { id: string; objectId: string; name: string; adapter: string; status: string; lastSeen: string | null; lastError: string | null; connectedDevices: number }[];
  canCommand?: boolean;
}) {
  const [view, setView] = useViewMode("devices");
  const router = useRouter();
  const rows = useObjectRows(devices);
  const readings = useObjectRows(meters);
  const hubs = useObjectRows(gateways);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; command: string } | null>(null);

  async function testCommand(deviceId: string, command: string, confirmToken?: string) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${deviceId}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, value: command === "setPower" ? true : undefined, confirmToken }),
      }),
    );
    if (result.payload?.needsConfirm && typeof result.payload.token === "string") {
      setToken(result.payload.token);
      setPending({ id: deviceId, command });
      setNotice("Подтвердите команду.");
      return;
    }
    setToken(null);
    setPending(null);
    setNotice(commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  return (
    <Shell title="Устройства">
      <ViewToggle value={view} onChange={setView} />
      <List empty="Шлюзов нет.">
        {hubs.map((gateway) => (
          <li key={gateway.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{gateway.name}</p>
            <p className="text-sm text-muted">
              {gateway.adapter} · {gateway.status}
              {gateway.lastSeen ? ` · ${gateway.lastSeen}` : ""}
              {gateway.connectedDevices ? ` · устройств ${gateway.connectedDevices}` : ""}
            </p>
            {gateway.lastError ? <p className="mt-1 text-sm text-danger">{gateway.lastError}</p> : null}
          </li>
        ))}
      </List>
      {view === "blocks" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.length === 0 ? (
            <li className="panel px-5 py-4 text-[15px] text-muted">Устройств нет.</li>
          ) : (
            rows.map((device) => (
              <li key={device.id ?? `${device.objectId}-${device.name}`} className="panel p-5">
                <p className="text-[16px] text-ink">{device.name}</p>
                <p className="mt-2 text-sm text-muted">
                  {device.kind} · {device.state}
                  {device.availability ? ` · ${device.availability}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {device.gatewayName ?? device.adapter ?? "локально"}
                  {device.lastSeen ? ` · ${device.lastSeen}` : ""}
                </p>
                {device.lastError ? <p className="mt-1 text-sm text-danger">{device.lastError}</p> : null}
                {canCommand && device.id ? (
                  <button type="button" className="btn btn-secondary btn-compact mt-3" onClick={() => void testCommand(device.id as string, "setPower")}>
                    Тест
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : (
        <List empty="Устройств нет.">
          {rows.map((device) => (
            <li key={device.id ?? `${device.objectId}-${device.name}`} className="px-5 py-4">
              <p className="text-[16px] text-ink">{device.name}</p>
              <p className="text-sm text-muted">
                {device.kind} · {device.state}
                {device.lastSeen ? ` · ${device.lastSeen}` : ""}
              </p>
              {device.lastError ? <p className="mt-1 text-sm text-danger">{device.lastError}</p> : null}
              {canCommand && device.id ? (
                <button type="button" className="btn btn-secondary btn-compact mt-3" onClick={() => void testCommand(device.id as string, "setPower")}>
                  Тест
                </button>
              ) : null}
            </li>
          ))}
        </List>
      )}
      {token && pending ? (
        <button type="button" className="btn btn-primary btn-compact" onClick={() => void testCommand(pending.id, pending.command, token)}>
          Подтвердить команду
        </button>
      ) : null}
      {notice ? <p className="text-[15px] text-muted">{notice}</p> : null}
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

function AccessPointEdit({
  point,
  onCancel,
  onSave,
}: {
  point: AccessPointRow;
  onCancel: () => void;
  onSave: (draft: { name: string; api: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState(point.name);
  const [api, setApi] = useState(point.endpoint);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({ name, api });
  }

  return (
    <li className="px-5 py-4">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-muted">Название</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Api</span>
          <input value={api} onChange={(event) => setApi(event.target.value)} className="control mt-2" placeholder="https://" />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary btn-compact">
            Сохранить
          </button>
          <button type="button" className="btn btn-secondary btn-compact" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>
    </li>
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
