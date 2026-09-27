"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { DeviceAddWizard } from "@/components/admin/DeviceAddWizard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ViewToggle, useViewMode } from "@/components/ui/ViewToggle";
import { commandMessage, runCommand } from "@/lib/command";
import { formatChannelValue } from "@/lib/format";

const FloorPlan = dynamic(() => import("@/components/home/FloorPlan").then((mod) => ({ default: mod.FloorPlan })), { ssr: false });
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
  const [localPoints, setLocalPoints] = useState<AccessPointRow[] | null>(null);
  const rows = useObjectRows(localPoints ?? points);

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
    const open = action === "open";
    const previous = localPoints ?? points;
    setLocalPoints(
      previous.map((point) =>
        point.id === pointId ? { ...point, latch: open ? "OPEN" : "CLOSED", status: open ? "Открыто" : "Закрыто" } : point,
      ),
    );
    setNotice(null);
    const url = open ? "/api/security/points" : `/api/access/object-points/${pointId}/close`;
    const result = await runCommand(() =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, pointId }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) setLocalPoints(previous);
    setNotice(commandMessage(result.payload));
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
                    <button type="button" className="btn btn-primary btn-compact" onClick={() => commandPoint(point.id, "open")} disabled={point.work !== "ON" || point.latch === "OPEN"}>
                      Открыть
                    </button>
                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => commandPoint(point.id, "close")} disabled={point.work !== "ON" || point.latch === "CLOSED"}>
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

type DeskChannel = {
  id: string;
  capability: string;
  displayName: string;
  unit: string;
  value: number | boolean | string | null;
  status: string;
  writable: boolean;
  enabled: boolean;
};

type DeskDevice = {
  id?: string;
  objectId: string;
  name: string;
  kind: string;
  kindCode?: string;
  state: string;
  availability?: string;
  status?: string;
  lastSeen?: string | null;
  adapter?: string;
  gatewayName?: string | null;
  lastError?: string | null;
  place?: string;
  roomId?: string | null;
  roomName?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  channels?: DeskChannel[];
  planFloor?: number | null;
  planX?: number | null;
  planY?: number | null;
};

type DeskRoom = { id: string; objectId: string; unitId?: string; unitName?: string; name: string; kind?: string };
type DeskUnit = { id: string; objectId: string; name: string };
type DeviceFilter = "all" | "online" | "offline" | "unconfigured" | "object" | "home";

const deviceFilters: { id: DeviceFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "online", label: "На связи" },
  { id: "offline", label: "Нет связи" },
  { id: "unconfigured", label: "Без настройки" },
  { id: "object", label: "Объект" },
  { id: "home", label: "Дом" },
];

function deviceStatus(device: DeskDevice): string {
  if (device.status === "UNCONFIGURED") return "Без настройки";
  if (device.status === "OFFLINE" || device.availability === "OFFLINE") return "Нет связи";
  if (device.status === "ONLINE" || device.availability === "ONLINE") return "На связи";
  if (device.status === "DEGRADED") return "Частично";
  if (device.status === "ERROR") return "Ошибка";
  if (device.status === "DISABLED") return "Выключено";
  if (device.status === "DISCOVERED") return "Найдено";
  return device.state;
}

function devicePlace(device: DeskDevice): string {
  if (device.place === "STREET") return "Улица посёлка";
  if (device.place === "OBJECT") return "Объект";
  return [device.unitName, device.roomName].filter(Boolean).join(" · ") || "Дом";
}

function matchesFilter(device: DeskDevice, filter: DeviceFilter): boolean {
  if (filter === "online") return device.status === "ONLINE" || device.availability === "ONLINE";
  if (filter === "offline") return device.status === "OFFLINE" || device.availability === "OFFLINE";
  if (filter === "unconfigured") return device.status === "UNCONFIGURED";
  if (filter === "object") return device.place === "OBJECT";
  if (filter === "home") return device.place === "ROOM";
  return true;
}

export function DeviceDesk({
  devices,
  meters = [],
  gateways = [],
  events = [],
  rooms = [],
  units = [],
  commandLogs = [],
  plans = [],
  canCommand = false,
  canPair = false,
  canCreate = false,
}: {
  devices: DeskDevice[];
  meters?: { objectId: string; name: string; value: string; unit: string }[];
  gateways?: { id: string; objectId: string; name: string; adapter: string; status: string; lastSeen: string | null; lastError: string | null; paired?: boolean; connectedDevices: number }[];
  events?: { id: string; objectId: string; title: string; at: string; result: string; severity?: string; source?: string }[];
  rooms?: DeskRoom[];
  units?: DeskUnit[];
  commandLogs?: { id: string; objectId: string; at: string; deviceId: string; command: string; result: string; source: string; risk: string }[];
  plans?: { unitId: string; unitName: string; objectId?: string; floors: { floor: number; image: string; pins: { deviceId: string; name: string; x: number; y: number }[] }[] }[];
  canCommand?: boolean;
  canPair?: boolean;
  canCreate?: boolean;
}) {
  const [view, setView] = useViewMode("devices");
  const router = useRouter();
  const { selected, can } = useAdminPreview();
  const allowCreate = canCreate || can("devices.create");
  const rows = useObjectRows(devices);
  const readings = useObjectRows(meters);
  const hubs = useObjectRows(gateways);
  const log = useObjectRows(events);
  const places = useObjectRows(rooms);
  const derivedHouses = (() => {
    const seen = new Map<string, DeskUnit>();
    for (const row of units) seen.set(row.id, row);
    for (const room of rooms) {
      if (!room.unitId || seen.has(room.unitId)) continue;
      seen.set(room.unitId, { id: room.unitId, objectId: room.objectId, name: room.unitName || room.unitId });
    }
    for (const device of devices) {
      if (!device.unitId || seen.has(device.unitId)) continue;
      seen.set(device.unitId, { id: device.unitId, objectId: device.objectId, name: device.unitName || device.unitId });
    }
    return [...seen.values()];
  })();
  const houses = useObjectRows(derivedHouses);
  const commands = useObjectRows(commandLogs);
  const maps = useObjectRows(plans.map((plan) => ({ ...plan, objectId: plan.objectId ?? "" })).filter((plan) => plan.objectId));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pairToken, setPairToken] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; command: string } | null>(null);
  const [pin, setPin] = useState({ deviceId: "", floor: "1", x: "50", y: "50" });
  const [bind, setBind] = useState({ deviceId: "", place: "ROOM", roomId: "" });

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

  async function pair(gatewayId: string) {
    setNotice(null);
    const result = await runCommand(() => fetch(`/api/smart-home/gateways/${gatewayId}/pair`, { method: "POST" }));
    const next = typeof result.payload?.token === "string" ? result.payload.token : null;
    setPairToken(next);
    setNotice(next ? "Токен покажите один раз. В приложение его не кладём." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  async function rotate(gatewayId: string) {
    setNotice(null);
    const result = await runCommand(() => fetch(`/api/smart-home/gateways/${gatewayId}/rotate`, { method: "POST" }));
    const next = typeof result.payload?.token === "string" ? result.payload.token : null;
    setPairToken(next);
    setNotice(next ? "Старый токен больше не действует." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  async function revoke(gatewayId: string) {
    setNotice(null);
    const result = await runCommand(() => fetch(`/api/smart-home/gateways/${gatewayId}/revoke`, { method: "POST" }));
    setPairToken(null);
    setNotice(result.ok ? "Канал отозван." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  async function place(event: React.FormEvent) {
    event.preventDefault();
    if (!pin.deviceId) return;
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${pin.deviceId}/place`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planFloor: Number(pin.floor), planX: Number(pin.x), planY: Number(pin.y) }),
      }),
    );
    setNotice(result.ok ? "Метка на плане сохранена." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  async function bindRoom(event: React.FormEvent) {
    event.preventDefault();
    if (!bind.deviceId) return;
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${bind.deviceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          bind.place === "ROOM"
            ? { place: "ROOM", roomId: bind.roomId }
            : { place: bind.place, unitId: null, roomId: null },
        ),
      }),
    );
    setNotice(result.ok ? "Помещение сохранено." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  const filtered = rows.filter((device) => {
    if (!matchesFilter(device, filter)) return false;
    const text = query.trim().toLowerCase();
    if (!text) return true;
    return (
      device.name.toLowerCase().includes(text) ||
      device.kind.toLowerCase().includes(text) ||
      (device.gatewayName ?? "").toLowerCase().includes(text) ||
      (device.roomName ?? "").toLowerCase().includes(text) ||
      (device.unitName ?? "").toLowerCase().includes(text)
    );
  });

  return (
    <Shell title="Устройства">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle value={view} onChange={setView} />
        {allowCreate && selected ? (
          <button type="button" className="btn btn-primary btn-compact" onClick={() => setAdding(true)}>
            Добавить
          </button>
        ) : null}
      </div>
      {adding && selected ? (
        <DeviceAddWizard
          objectId={selected.id}
          gateways={hubs}
          rooms={places.map((room) => ({
            id: room.id,
            objectId: room.objectId,
            unitId: room.unitId ?? "",
            unitName: room.unitName ?? "",
            name: room.name,
          }))}
          units={houses}
          onClose={() => setAdding(false)}
        />
      ) : null}
      <input value={query} onChange={(event) => setQuery(event.target.value)} className="control" placeholder="Поиск по имени или типу" />
      <div className="flex flex-wrap gap-2">
        {deviceFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn btn-compact ${filter === item.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
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
            <p className="mt-1 text-sm text-muted">{gateway.paired ? "Канал выдан" : "Канал не выдан"}</p>
            {canPair ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => void pair(gateway.id)}>
                  Выдать токен
                </button>
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => void rotate(gateway.id)}>
                  Сменить
                </button>
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => void revoke(gateway.id)}>
                  Отозвать
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </List>
      {pairToken ? <p className="break-all text-[13px] text-muted">{pairToken}</p> : null}
      {view === "blocks" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.length === 0 ? (
            <li className="panel px-5 py-4 text-[15px] text-muted">Устройств нет.</li>
          ) : (
            filtered.map((device) => (
              <li key={device.id ?? `${device.objectId}-${device.name}`} className="panel p-5">
                <p className="text-[16px] text-ink">{device.name}</p>
                <p className="mt-2 text-sm text-muted">
                  {device.kind} · {deviceStatus(device)} · {devicePlace(device)}
                </p>
                {(device.channels ?? []).filter((channel) => channel.enabled).length ? (
                  <p className="mt-1 text-sm text-muted">
                    {(device.channels ?? [])
                      .filter((channel) => channel.enabled)
                      .slice(0, 4)
                      .map((channel) => `${channel.displayName} ${formatChannelValue(channel.value, channel.unit)}`)
                      .join(" · ")}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">{device.state}</p>
                )}
                {device.lastError ? <p className="mt-1 text-sm text-danger">{device.lastError}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {device.id ? (
                    <Link href={`/admin/devices/${device.id}`} className="btn btn-secondary btn-compact">
                      Открыть
                    </Link>
                  ) : null}
                  {canCommand && device.id ? (
                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => void testCommand(device.id as string, "setPower")}>
                      Тест
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      ) : (
        <List empty="Устройств нет.">
          {filtered.map((device) => (
            <li key={device.id ?? `${device.objectId}-${device.name}`} className="px-5 py-4">
              <p className="text-[16px] text-ink">{device.name}</p>
              <p className="text-sm text-muted">
                {device.kind} · {deviceStatus(device)} · {devicePlace(device)}
              </p>
              {(device.channels ?? []).filter((channel) => channel.enabled).length ? (
                <p className="mt-1 text-sm text-muted">
                  {(device.channels ?? [])
                    .filter((channel) => channel.enabled)
                    .slice(0, 4)
                    .map((channel) => `${channel.displayName} ${formatChannelValue(channel.value, channel.unit)}`)
                    .join(" · ")}
                </p>
              ) : null}
              {device.lastError ? <p className="mt-1 text-sm text-danger">{device.lastError}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {device.id ? (
                  <Link href={`/admin/devices/${device.id}`} className="btn btn-secondary btn-compact">
                    Открыть
                  </Link>
                ) : null}
                {canCommand && device.id ? (
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => void testCommand(device.id as string, "setPower")}>
                    Тест
                  </button>
                ) : null}
              </div>
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
      {canPair ? (
        <form onSubmit={place} className="panel grid gap-3 px-5 py-5 sm:grid-cols-4">
          <select value={pin.deviceId} onChange={(event) => setPin((current) => ({ ...current, deviceId: event.target.value }))} className="control sm:col-span-4">
            <option value="">Устройство на плане</option>
            {rows.filter((device) => device.id).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.planX != null ? ` · ${device.planFloor}эт` : ""}
              </option>
            ))}
          </select>
          <input value={pin.floor} onChange={(event) => setPin((current) => ({ ...current, floor: event.target.value }))} className="control" placeholder="Этаж" />
          <input value={pin.x} onChange={(event) => setPin((current) => ({ ...current, x: event.target.value }))} className="control" placeholder="X %" />
          <input value={pin.y} onChange={(event) => setPin((current) => ({ ...current, y: event.target.value }))} className="control" placeholder="Y %" />
          <button type="submit" className="btn btn-secondary btn-compact">
            Поставить
          </button>
        </form>
      ) : null}
      {canPair ? (
        <form onSubmit={bindRoom} className="panel grid gap-3 px-5 py-5 sm:grid-cols-4">
          <select value={bind.deviceId} onChange={(event) => setBind((current) => ({ ...current, deviceId: event.target.value }))} className="control">
            <option value="">Устройство</option>
            {rows.filter((device) => device.id).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <select value={bind.place} onChange={(event) => setBind((current) => ({ ...current, place: event.target.value }))} className="control">
            <option value="OBJECT">Объект</option>
            <option value="STREET">Улица посёлка</option>
            <option value="ROOM">Дом / помещение</option>
          </select>
          <select
            value={bind.roomId}
            onChange={(event) => setBind((current) => ({ ...current, roomId: event.target.value }))}
            className="control"
            disabled={bind.place !== "ROOM"}
          >
            <option value="">Помещение или улица дома</option>
            {places.map((room) => (
              <option key={room.id} value={room.id}>
                {room.unitName ? `${room.unitName} · ${room.name}` : room.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary btn-compact">
            Привязать
          </button>
        </form>
      ) : null}
      {maps.map((plan) => (
        <div key={plan.unitId}>
          <p className="mb-2 text-[15px] text-ink">{plan.unitName}</p>
          <FloorPlan floors={plan.floors} editable={canPair} />
        </div>
      ))}
      <List empty="Журнала команд нет.">
        {commands.map((row) => (
          <li key={row.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{row.command}</p>
            <p className="text-sm text-muted">
              {row.at} · {row.result} · {row.source} · {row.risk}
            </p>
          </li>
        ))}
      </List>
      <List empty="Событий нет.">
        {log.map((event) => (
          <li key={event.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{event.title}</p>
            <p className="text-sm text-muted">
              {event.at} · {event.result}
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
