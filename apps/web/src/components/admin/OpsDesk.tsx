"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { DeviceAddWizard } from "@/components/admin/DeviceAddWizard";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select } from "@/components/ui/Select";
import { ViewToggle, useViewMode } from "@/components/ui/ViewToggle";
import { commandMessage, runCommand } from "@/lib/command";
import { formatChannelValue, formatLastContact, formatMoney, formatProbeResult, gatewayErrorText, gatewayStatusLabel } from "@/lib/format";
import { objectPresentation } from "@/lib/object-presentation";

const FloorPlan = dynamic(() => import("@/components/home/FloorPlan").then((mod) => ({ default: mod.FloorPlan })), { ssr: false });
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
    setNotice(null);
    const url = open ? "/api/security/points" : `/api/access/object-points/${pointId}/close`;
    const result = await runCommand(() =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: selected.id, pointId }),
      }),
    );
    if (result.ok && result.payload?.confirmed === true) {
      setLocalPoints((current) =>
        (current ?? points).map((point) =>
          point.id === pointId ? { ...point, latch: open ? "OPEN" : "CLOSED", status: open ? "Открыто" : "Закрыто" } : point,
        ),
      );
    }
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
  source?: "REAL" | "DEMO" | "MOCK" | "UNKNOWN";
  place?: string;
  roomId?: string | null;
  roomName?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  handedOver?: boolean;
  lastProbeAt?: string | null;
  lastProbeMs?: number | null;
  lastProbeResult?: string | null;
  channels?: DeskChannel[];
  planFloor?: number | null;
  planX?: number | null;
  planY?: number | null;
};

type DeskRoom = { id: string; objectId: string; unitId?: string; unitName?: string; name: string; kind?: string };
type DeskUnit = { id: string; objectId: string; name: string };
type DeviceFilter = "all" | "online" | "offline" | "unconfigured";
type DeviceScope = "object" | "house";

const deviceFilters: { id: DeviceFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "online", label: "На связи" },
  { id: "offline", label: "Нет связи" },
  { id: "unconfigured", label: "Без настройки" },
];

function deviceStatus(device: DeskDevice): string {
  if (device.status === "UNCONFIGURED") return "Без настройки";
  if (device.status === "OFFLINE" || device.availability === "OFFLINE") return "Нет связи";
  if (device.status === "ONLINE" || device.availability === "ONLINE") {
    if (device.source === "DEMO") return "Демо";
    if (device.source === "MOCK") return "Симулятор";
    return "На связи";
  }
  if (device.status === "DEGRADED") return "Частично";
  if (device.status === "ERROR") return "Ошибка";
  if (device.status === "DISABLED") return "Выключено";
  if (device.status === "DISCOVERED") return "Найдено";
  return device.state;
}

function devicePlace(device: DeskDevice): string {
  if (device.place === "OBJECT") return "Объект";
  if (device.place === "STREET") return device.unitName ? `${device.unitName} · улица` : "Улица объекта";
  return [device.unitName, device.roomName].filter(Boolean).join(" · ") || "Дом";
}

function commandResultLabel(result: string): string {
  if (result === "SUCCESS") return "выполнено";
  if (result === "UNCONFIRMED") return "не подтверждено";
  if (result === "DENIED") return "отказ";
  if (result === "ERROR") return "ошибка";
  return result;
}

const gatewayAdapterOptions = [
  { id: "simulator", label: "Симулятор" },
  { id: "wirenboard", label: "Wiren Board" },
  { id: "mqtt", label: "MQTT" },
  { id: "http", label: "HTTP" },
  { id: "local", label: "Локальный адаптер" },
] as const;

function gatewayAdapterLabel(adapter: string): string {
  return gatewayAdapterOptions.find((item) => item.id === adapter)?.label ?? adapter;
}

function matchesFilter(device: DeskDevice, filter: DeviceFilter): boolean {
  if (filter === "online") return device.status === "ONLINE" || device.availability === "ONLINE";
  if (filter === "offline") return device.status === "OFFLINE" || device.availability === "OFFLINE";
  if (filter === "unconfigured") return device.status === "UNCONFIGURED";
  return true;
}

function objectLevel(device: DeskDevice): boolean {
  return device.place === "OBJECT" || (device.place === "STREET" && !device.unitId);
}

function houseSort(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, "ru", { numeric: true });
}

export function DeviceDesk({
  devices,
  meters = [],
  gateways = [],
  events = [],
  rooms = [],
  units = [],
  commandLogs = [],
  exchanges = [],
  plans = [],
  canCommand = false,
  canPair = false,
  canCreate = false,
}: {
  devices: DeskDevice[];
  meters?: { objectId: string; name: string; value: string; unit: string }[];
  gateways?: {
    id: string;
    objectId: string;
    name: string;
    adapter: string;
    status: string;
    version?: string | null;
    lastSeen: string | null;
    lastError: string | null;
    stale?: boolean;
    paired?: boolean;
    bufferLag?: number;
    mqtt?: "up" | "down" | "none" | null;
    connectedDevices: number;
  }[];
  events?: { id: string; objectId: string; title: string; at: string; result: string; severity?: string; source?: string }[];
  rooms?: DeskRoom[];
  units?: DeskUnit[];
  commandLogs?: {
    id: string;
    objectId: string;
    at: string;
    deviceId: string;
    deviceName?: string;
    command: string;
    result: string;
    source: string;
    risk: string;
    reason?: string | null;
  }[];
  exchanges?: { id: string; objectId: string; at: string; kind: string; result: string; detail: string; gatewayName?: string }[];
  plans?: { unitId: string; unitName: string; objectId?: string; floors: { floor: number; image: string; pins: { deviceId: string; name: string; x: number; y: number }[] }[] }[];
  canCommand?: boolean;
  canPair?: boolean;
  canCreate?: boolean;
}) {
  const [view, setView] = useViewMode("devices");
  const router = useRouter();
  const { selected, objects, can } = useAdminPreview();
  const multiObject = objects.length > 1;
  const [objectId, setObjectId] = useState(selected?.id ?? objects[0]?.id ?? "");
  const workingId = (multiObject ? objectId : selected?.id) || objects[0]?.id || "";
  const working = objects.find((item) => item.id === workingId) ?? selected;
  const allowCreate = canCreate || can("devices.create");
  const rows = devices.filter((row) => row.objectId === workingId);
  const readings = meters.filter((row) => row.objectId === workingId);
  const hubs = gateways.filter((row) => row.objectId === workingId);
  const log = events.filter((row) => row.objectId === workingId);
  const places = rooms.filter((row) => row.objectId === workingId);
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
  const houses = derivedHouses.filter((row) => row.objectId === workingId).slice().sort(houseSort);
  const commands = commandLogs.filter((row) => row.objectId === workingId);
  const journal = exchanges.filter((row) => row.objectId === workingId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [scope, setScope] = useState<DeviceScope>("house");
  const [houseQuery, setHouseQuery] = useState("");
  const [houseId, setHouseId] = useState("");
  const maps = plans
    .map((plan) => ({ ...plan, objectId: plan.objectId ?? "" }))
    .filter((plan) => plan.objectId === workingId)
    .filter((plan) => scope === "house" && Boolean(houseId) && plan.unitId === houseId);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pairToken, setPairToken] = useState<string | null>(null);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [handingId, setHandingId] = useState<string | null>(null);
  const [pin, setPin] = useState({ deviceId: "", floor: "1", x: "50", y: "50" });
  const [bind, setBind] = useState({ deviceId: "", place: "ROOM", roomId: "" });
  const [hubName, setHubName] = useState("Симулятор пилота");
  const [hubAdapter, setHubAdapter] = useState("simulator");
  const unitsLabel = working ? objectPresentation[working.type].unitsLabel : "Дома";
  const visibleHouses = useMemo(() => {
    const needle = houseQuery.trim().toLowerCase();
    return needle ? houses.filter((house) => house.name.toLowerCase().includes(needle)) : houses;
  }, [houses, houseQuery]);
  const selectedHouse = houses.find((house) => house.id === houseId) ?? null;
  const canAdd = allowCreate && Boolean(workingId) && (scope === "object" || Boolean(houseId));

  async function probe(deviceId: string) {
    setNotice(null);
    setProbingId(deviceId);
    const result = await runCommand(() => fetch(`/api/smart-home/devices/${deviceId}/probe`, { method: "POST" }));
    setProbingId(null);
    setNotice(commandMessage(result.payload, "Не удалось проверить устройство."));
    if (result.ok) router.refresh();
  }

  async function handOver(deviceId: string, recall = false) {
    setNotice(null);
    setHandingId(deviceId);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${deviceId}/handover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recall }),
      }),
    );
    setHandingId(null);
    setNotice(
      result.ok
        ? recall
          ? "Забрано у жильца."
          : "Передано жильцу."
        : commandMessage(result.payload, "Не удалось передать жильцу."),
    );
    if (result.ok) router.refresh();
  }

  async function createHub(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workingId) return;
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/smart-home/gateways", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId: workingId, name: hubName, adapter: hubAdapter }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload, "Не удалось создать шлюз."));
      return;
    }
    setNotice(
      hubAdapter === "simulator"
        ? "Шлюз-симулятор создан. Устройства на нём — MOCK, не REAL."
        : "Шлюз создан.",
    );
    router.refresh();
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
          bind.place === "OBJECT"
            ? { place: "OBJECT", unitId: null, roomId: null }
            : { place: bind.place, roomId: bind.roomId },
        ),
      }),
    );
    setNotice(result.ok ? "Помещение сохранено." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  function deviceLine(device: DeskDevice): string {
    const probeText = formatProbeResult(device.lastProbeMs, device.lastProbeResult);
    return [
      device.kind,
      deviceStatus(device),
      devicePlace(device),
      device.lastSeen ? formatLastContact(device.lastSeen) : null,
      device.handedOver === false ? "не передано жильцу" : device.lastProbeResult ? "передано жильцу" : null,
      probeText,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function deviceActions(device: DeskDevice) {
    const id = device.id;
    if (!id) return null;
    const handedOver = device.handedOver !== false;
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/admin/devices/${id}`} className="btn btn-secondary btn-compact">
          Открыть
        </Link>
        {canCommand ? (
          <button type="button" className="btn btn-secondary btn-compact" disabled={probingId === id} onClick={() => void probe(id)}>
            {probingId === id ? "Проверяем…" : "Проверка"}
          </button>
        ) : null}
        {canPair && handedOver ? (
          <button type="button" className="btn btn-secondary btn-compact" disabled={handingId === id} onClick={() => void handOver(id, true)}>
            Забрать у жильца
          </button>
        ) : null}
        {canPair && !handedOver ? (
          <button
            type="button"
            className="btn btn-primary btn-compact"
            disabled={handingId === id || device.lastProbeResult !== "confirmed"}
            onClick={() => void handOver(id, false)}
          >
            Передать жильцу
          </button>
        ) : null}
      </div>
    );
  }

  const scoped = rows.filter((device) => (scope === "object" ? objectLevel(device) : Boolean(houseId) && device.unitId === houseId));
  const filtered = scoped.filter((device) => {
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

  const emptyDevices = scope === "house" && !houseId ? "Выберите дом, чтобы увидеть устройства." : "Устройств нет.";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Устройства</h1>
          <p className="mt-3 text-[15px] text-muted">{working?.name ?? "Объект не выбран"}</p>
        </div>
        {canAdd ? (
          <button type="button" className="btn btn-primary btn-icon" aria-label="Добавить устройство" onClick={() => setAdding(true)}>
            <Icon name="plus" />
          </button>
        ) : null}
      </div>
      <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle value={view} onChange={setView} />
      </div>
      {multiObject ? (
        <label className="block">
          <span className="text-sm text-muted">Объект</span>
          <Select
            wrapClassName="mt-2"
            value={workingId}
            onChange={(event) => {
              setObjectId(event.target.value);
              setHouseId("");
              setHouseQuery("");
            }}
          >
            {objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn btn-compact ${scope === "object" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setScope("object")}
        >
          Объект
        </button>
        <button
          type="button"
          className={`btn btn-compact ${scope === "house" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setScope("house")}
        >
          {unitsLabel}
        </button>
      </div>
      {scope === "house" ? (
        <div>
          <label className="block">
            <span className="text-sm text-muted">Найти {unitsLabel.toLowerCase()}</span>
            <input
              value={houseQuery}
              onChange={(event) => setHouseQuery(event.target.value)}
              className="control mt-2"
              placeholder="Номер или название"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleHouses.slice(0, 16).map((house) => (
              <button
                key={house.id}
                type="button"
                className={`btn btn-compact ${house.id === houseId ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setHouseId(house.id)}
              >
                {house.name}
              </button>
            ))}
          </div>
          {visibleHouses.length > 16 ? <p className="mt-2 text-sm text-muted">Найдено {visibleHouses.length}. Уточните поиск.</p> : null}
          {selectedHouse ? <p className="mt-3 text-[15px] text-ink">{selectedHouse.name}</p> : null}
        </div>
      ) : null}
      {adding && workingId ? (
        <DeviceAddWizard
          objectId={workingId}
          gateways={hubs}
          rooms={places.map((room) => ({
            id: room.id,
            objectId: room.objectId,
            unitId: room.unitId ?? "",
            unitName: room.unitName ?? "",
            name: room.name,
            kind: room.kind,
          }))}
          units={houses}
          lockScope={scope === "object" ? "object" : "house"}
          initialUnitId={scope === "house" ? houseId : undefined}
          asDialog
          onClose={() => setAdding(false)}
        />
      ) : null}
      <input value={query} onChange={(event) => setQuery(event.target.value)} className="control" placeholder="Поиск по имени или типу" />
      {notice ? <p className="text-[15px] text-muted">{notice}</p> : null}
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
      {allowCreate && workingId ? (
        <form onSubmit={createHub} className="panel p-5">
          <p className="text-[16px] text-ink">Создать шлюз</p>
          <p className="mt-1 text-sm text-muted">Для пилота без железа выбирайте симулятор. Wiren Board без контроллера не ставить.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-muted">Название</span>
              <input value={hubName} onChange={(event) => setHubName(event.target.value)} className="control mt-2" />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Адаптер</span>
              <Select value={hubAdapter} onChange={(event) => setHubAdapter(event.target.value)} wrapClassName="mt-2">
                {gatewayAdapterOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <button type="submit" className="mt-5 btn btn-primary">
            Создать шлюз
          </button>
        </form>
      ) : null}
      <List empty="Шлюзов нет.">
        {hubs.map((gateway) => (
          <li key={gateway.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{gateway.name}</p>
            <p className="text-sm text-muted">
              {gatewayAdapterLabel(gateway.adapter)}
              {` · ${gatewayStatusLabel(gateway.status, gateway.lastSeen)}`}
              {gateway.version ? ` · ${gateway.version}` : ""}
              {` · ${formatLastContact(gateway.lastSeen)}`}
              {gateway.connectedDevices ? ` · устройств ${gateway.connectedDevices}` : ""}
              {gateway.bufferLag ? ` · очередь ${gateway.bufferLag}` : ""}
              {gateway.mqtt === "down" ? " · MQTT нет" : gateway.mqtt === "up" ? " · MQTT" : ""}
            </p>
            {gatewayErrorText(gateway.lastError) ? <p className="mt-1 text-sm text-danger">{gatewayErrorText(gateway.lastError)}</p> : null}
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
            <li className="panel px-5 py-4 text-[15px] text-muted">{emptyDevices}</li>
          ) : (
            filtered.map((device) => (
              <li key={device.id ?? `${device.objectId}-${device.name}`} className="panel p-5">
                <p className="text-[16px] text-ink">{device.name}</p>
                <p className="mt-2 text-sm text-muted">{deviceLine(device)}</p>
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
                {device.lastError ? <p className="mt-1 text-sm text-danger">{gatewayErrorText(device.lastError)}</p> : null}
                {deviceActions(device)}
              </li>
            ))
          )}
        </ul>
      ) : (
        <List empty={emptyDevices}>
          {filtered.map((device) => (
            <li key={device.id ?? `${device.objectId}-${device.name}`} className="px-5 py-4">
              <p className="text-[16px] text-ink">{device.name}</p>
              <p className="text-sm text-muted">{deviceLine(device)}</p>
              {(device.channels ?? []).filter((channel) => channel.enabled).length ? (
                <p className="mt-1 text-sm text-muted">
                  {(device.channels ?? [])
                    .filter((channel) => channel.enabled)
                    .slice(0, 4)
                    .map((channel) => `${channel.displayName} ${formatChannelValue(channel.value, channel.unit)}`)
                    .join(" · ")}
                </p>
              ) : null}
              {device.lastError ? <p className="mt-1 text-sm text-danger">{gatewayErrorText(device.lastError)}</p> : null}
              {deviceActions(device)}
            </li>
          ))}
        </List>
      )}
      {canPair ? (
        <form onSubmit={place} className="panel grid gap-3 px-5 py-5 sm:grid-cols-4">
          <Select value={pin.deviceId} onChange={(event) => setPin((current) => ({ ...current, deviceId: event.target.value }))} wrapClassName="sm:col-span-4">
            <option value="">Устройство на плане</option>
            {scoped.filter((device) => device.id).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.planX != null ? ` · ${device.planFloor}эт` : ""}
              </option>
            ))}
          </Select>
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
          <Select value={bind.deviceId} onChange={(event) => setBind((current) => ({ ...current, deviceId: event.target.value }))}>
            <option value="">Устройство</option>
            {rows.filter((device) => device.id).map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </Select>
          <Select value={bind.place} onChange={(event) => setBind((current) => ({ ...current, place: event.target.value }))}>
            <option value="OBJECT">Объект</option>
            <option value="STREET">Улица дома</option>
            <option value="ROOM">Дом / помещение</option>
          </Select>
          <Select
            value={bind.roomId}
            onChange={(event) => setBind((current) => ({ ...current, roomId: event.target.value }))}
            disabled={bind.place === "OBJECT"}
          >
            <option value="">Помещение или улица дома</option>
            {places.map((room) => (
              <option key={room.id} value={room.id}>
                {room.unitName ? `${room.unitName} · ${room.kind === "STREET" ? "улица" : room.name}` : room.name}
              </option>
            ))}
          </Select>
          <button type="submit" className="btn btn-secondary btn-compact">
            Привязать
          </button>
        </form>
      ) : null}
      {scope === "house" && houseId ? (
        maps.length ? (
          maps.map((plan) => (
            <div key={plan.unitId}>
              <FloorPlan floors={plan.floors} editable={canPair} />
            </div>
          ))
        ) : (
          <FloorPlan floors={[]} />
        )
      ) : null}
      <List empty="Журнала обмена нет.">
        {journal.map((row) => (
          <li key={row.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{row.gatewayName || "Шлюз"}</p>
            <p className="text-sm text-muted">
              {formatLastContact(row.at)} · {row.kind} · {row.result === "error" ? "ошибка" : "ок"} · {row.detail}
            </p>
          </li>
        ))}
      </List>
      <List empty="Журнала команд нет.">
        {commands.map((row) => (
          <li key={row.id} className="px-5 py-4">
            <p className="text-[16px] text-ink">{row.deviceName || row.deviceId} · {row.command}</p>
            <p className="text-sm text-muted">
              {formatLastContact(row.at)} · {commandResultLabel(row.result)} · {row.source}
              {row.reason ? ` · ${gatewayErrorText(row.reason) ?? row.reason}` : ""}
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
      </div>
    </div>
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
