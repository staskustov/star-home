"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { formatChannelValue, formatLastContact, gatewayErrorText } from "@/lib/format";
import { commandMessage, runCommand } from "@/lib/command";
import { Select } from "@/components/ui/Select";

type Channel = {
  id: string;
  capability: string;
  displayName: string;
  unit: string;
  value: number | boolean | string | null;
  status: string;
  writable: boolean;
  enabled: boolean;
  externalId?: string;
};

export type AdminDevice = {
  id: string;
  objectId: string;
  name: string;
  kind: string;
  kindCode?: string;
  state: string;
  availability?: string;
  status?: string;
  lastSeen?: string | null;
  adapter?: string;
  gatewayId?: string | null;
  gatewayName?: string | null;
  lastError?: string | null;
  place?: string;
  roomId?: string | null;
  roomName?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  externalId?: string | null;
  channels: Channel[];
};

type Room = { id: string; objectId: string; unitId: string; unitName: string; name: string };
type Unit = { id: string; objectId: string; name: string };
type Gateway = { id: string; objectId: string; name: string; adapter: string; status: string; version?: string | null; lastSeen?: string | null; lastError?: string | null };

const statusText: Record<string, string> = {
  ONLINE: "На связи",
  OFFLINE: "Нет связи",
  UNCONFIGURED: "Без настройки",
  DEGRADED: "Частично",
  ERROR: "Ошибка",
  DISABLED: "Выключено",
  DISCOVERED: "Найдено",
  UNKNOWN: "Неизвестно",
};

function placeText(device: AdminDevice): string {
  if (device.place === "STREET") return "Улица посёлка";
  if (device.place === "OBJECT") return "Объект целиком";
  return [device.unitName, device.roomName].filter(Boolean).join(" · ") || "Дом";
}

export function DeviceDetail({
  device,
  rooms = [],
  units = [],
  gateways = [],
  canCommand = false,
  canEdit = false,
  canTechnical = false,
}: {
  device: AdminDevice;
  rooms?: Room[];
  units?: Unit[];
  gateways?: Gateway[];
  canCommand?: boolean;
  canEdit?: boolean;
  canTechnical?: boolean;
}) {
  const router = useRouter();
  const { can } = useAdminPreview();
  const allowEdit = canEdit || can("devices.edit");
  const allowCommand = canCommand || can("devices.command");
  const allowTechnical = canTechnical || can("engineering.view");
  const houses = (units ?? []).filter((item) => item.objectId === device.objectId);
  const hubs = (gateways ?? []).filter((item) => item.objectId === device.objectId);
  const [name, setName] = useState(device.name);
  const [place, setPlace] = useState(device.place === "STREET" || device.place === "OBJECT" ? device.place : "ROOM");
  const [unitId, setUnitId] = useState(device.unitId ?? houses[0]?.id ?? "");
  const [roomId, setRoomId] = useState(device.roomId ?? "");
  const [gatewayId, setGatewayId] = useState(device.gatewayId ?? "");
  const [channels, setChannels] = useState(device.channels ?? []);
  const [technical, setTechnical] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roomsOfHouse = useMemo(() => {
    const list = rooms ?? [];
    const ofHouse = list.filter((room) => room.objectId === device.objectId && room.unitId === unitId);
    if (ofHouse.length) return ofHouse;
    return list.filter((room) => room.objectId === device.objectId && (!unitId || !room.unitId));
  }, [rooms, device.objectId, unitId]);

  async function save() {
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${device.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          place,
          unitId: place === "ROOM" ? unitId : null,
          roomId: place === "ROOM" ? roomId : null,
          gatewayId: gatewayId || null,
          channels,
        }),
      }),
    );
    setBusy(false);
    setNotice(result.ok ? "Сохранено." : commandMessage(result.payload, "Не удалось сохранить."));
    if (result.ok) router.refresh();
  }

  async function testCommand(command: string, confirmToken?: string) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${device.id}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, value: command === "setPower" ? true : undefined, confirmToken }),
      }),
    );
    if (result.payload?.needsConfirm && typeof result.payload.token === "string") {
      setToken(result.payload.token);
      setPending(command);
      setNotice("Подтвердите команду.");
      return;
    }
    setToken(null);
    setPending(null);
    setNotice(commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/devices" className="text-sm text-muted transition-colors hover:text-ink">
        К устройствам
      </Link>
      <h1 className="mt-4 text-[36px] leading-none tracking-[-0.04em] text-ink">{device.name}</h1>
      <p className="mt-3 text-[15px] text-muted">
        {device.kind} · {statusText[device.status ?? device.availability ?? "UNKNOWN"] ?? device.status} · {placeText(device)}
        {device.lastSeen ? ` · ${formatLastContact(device.lastSeen)}` : ""}
      </p>
      {device.lastError ? <p className="mt-2 text-sm text-danger">{gatewayErrorText(device.lastError)}</p> : null}

      <div className="mt-8 space-y-6">
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm text-muted">Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" disabled={!allowEdit} />
          </label>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
            {(["ROOM", "OBJECT", "STREET"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`btn btn-compact ${place === item ? "btn-primary" : "btn-secondary"}`}
                disabled={!allowEdit || (device.kindCode === "WEATHER" && item !== "STREET")}
                onClick={() => setPlace(item)}
              >
                {item === "ROOM" ? "Дом и помещение" : item === "OBJECT" ? "Объект целиком" : "Улица посёлка"}
              </button>
            ))}
          </div>
          {place === "ROOM" ? (
            <>
              <label className="block">
                <span className="text-sm text-muted">Дом</span>
                <Select
                  value={unitId}
                  disabled={!allowEdit}
                  onChange={(event) => {
                    setUnitId(event.target.value);
                    setRoomId("");
                  }}
                  wrapClassName="mt-2"
                >
                  {houses.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="text-sm text-muted">Помещение</span>
                <Select value={roomId} disabled={!allowEdit} onChange={(event) => setRoomId(event.target.value)} wrapClassName="mt-2">
                  {roomsOfHouse.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </Select>
              </label>
            </>
          ) : null}
          <label className="block sm:col-span-2">
            <span className="text-sm text-muted">Шлюз</span>
            <Select value={gatewayId} disabled={!allowEdit} onChange={(event) => setGatewayId(event.target.value)} wrapClassName="mt-2">
              <option value="">Без шлюза</option>
              {hubs.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name}
                </option>
              ))}
            </Select>
          </label>
        </section>

        <section className="panel p-5">
          <p className="text-[16px] text-ink">Каналы</p>
          <ul className="mt-4 divide-y divide-line">
            {channels.map((channel) => (
              <li key={channel.id} className="flex flex-wrap items-center gap-3 py-3">
                {allowEdit ? (
                  <input
                    type="checkbox"
                    checked={channel.enabled}
                    onChange={(event) =>
                      setChannels((current) =>
                        current.map((item) => (item.id === channel.id ? { ...item, enabled: event.target.checked } : item)),
                      )
                    }
                  />
                ) : null}
                {allowEdit ? (
                  <input
                    value={channel.displayName}
                    onChange={(event) =>
                      setChannels((current) =>
                        current.map((item) => (item.id === channel.id ? { ...item, displayName: event.target.value } : item)),
                      )
                    }
                    className="control min-w-0 flex-1"
                  />
                ) : (
                  <span className="flex-1 text-[16px] text-ink">{channel.displayName}</span>
                )}
                <span className="w-28 shrink-0 text-sm text-muted">{formatChannelValue(channel.value, channel.unit)}</span>
                <span className="w-24 shrink-0 text-sm text-muted">
                  {channel.status === "LIVE" ? "данные поступают" : channel.status === "STALE" ? "устарело" : "Нет данных"}
                </span>
                {technical && allowTechnical ? <span className="w-full text-[13px] text-muted">{channel.capability} · {channel.externalId}</span> : null}
              </li>
            ))}
          </ul>
        </section>

        {allowTechnical ? (
          <section className="panel p-5">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={technical} onChange={(event) => setTechnical(event.target.checked)} />
              <span className="text-[16px] text-ink">Технические поля</span>
            </label>
            {technical ? (
              <dl className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
                <div>
                  <dt>Производитель</dt>
                  <dd className="text-ink">{device.manufacturer || "—"}</dd>
                </div>
                <div>
                  <dt>Модель</dt>
                  <dd className="text-ink">{device.model || "—"}</dd>
                </div>
                <div>
                  <dt>Серийный номер</dt>
                  <dd className="text-ink">{device.serialNumber || "—"}</dd>
                </div>
                <div>
                  <dt>Внешний id</dt>
                  <dd className="text-ink">{device.externalId || "—"}</dd>
                </div>
                <div>
                  <dt>Последний контакт</dt>
                  <dd className="text-ink">{formatLastContact(device.lastSeen)}</dd>
                </div>
                <div>
                  <dt>Шлюз</dt>
                  <dd className="text-ink">{device.gatewayName || "—"}</dd>
                </div>
                <div>
                  <dt>Адаптер</dt>
                  <dd className="text-ink">{device.adapter || "—"}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {allowEdit ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              Сохранить
            </button>
          ) : null}
          {allowCommand ? (
            <button type="button" className="btn btn-secondary" onClick={() => void testCommand("setPower")}>
              Тест
            </button>
          ) : null}
          {token && pending ? (
            <button type="button" className="btn btn-primary" onClick={() => void testCommand(pending, token)}>
              Подтвердить команду
            </button>
          ) : null}
        </div>
        {notice ? <p className="text-[15px] text-muted">{notice}</p> : null}
      </div>
    </div>
  );
}
