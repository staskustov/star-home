"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deviceKinds, deviceLabel, inferKindFromCapabilities, type DeviceKind } from "@/server/device-kinds";
import { capabilitiesFor, type Capability } from "@/server/device-capabilities";
import { displayNameForCapability, unitForCapability } from "@/server/device-channels";
import { commandMessage, runCommand } from "@/lib/command";
import { Select } from "@/components/ui/Select";
import { IconPicker } from "@/components/admin/IconPicker";
import { deviceIconOf } from "@/lib/google-icons";

type Gateway = { id: string; objectId: string; name: string; adapter: string; status: string };
type Room = { id: string; objectId: string; unitId: string; unitName: string; name: string; kind?: string };
type Unit = { id: string; objectId: string; name: string };
type FoundDevice = {
  externalId: string;
  manufacturer: string | null;
  model: string | null;
  online: boolean;
  alreadyRegistered?: { deviceId: string; name: string };
  channels: { externalId: string; capability: string | null; displayName: string; unit: string; value: number | boolean | string | null }[];
};
type DraftChannel = {
  capability: Capability;
  displayName: string;
  unit: string;
  externalId: string;
  enabled: boolean;
  value: number | boolean | string | null;
};

function channelsFromCaps(kind: string): DraftChannel[] {
  return capabilitiesFor(kind).map((capability) => ({
    capability,
    displayName: displayNameForCapability(capability),
    unit: unitForCapability(capability),
    externalId: capability,
    enabled: true,
    value: null,
  }));
}

function channelsFromFound(device: FoundDevice): DraftChannel[] {
  return device.channels
    .map((channel) => {
      const capability = channel.capability as Capability | null;
      if (!capability) return null;
      return {
        capability,
        displayName: channel.displayName,
        unit: channel.unit,
        externalId: channel.externalId,
        enabled: true,
        value: channel.value,
      };
    })
    .filter((item): item is DraftChannel => Boolean(item));
}

function houseSort(left: Unit, right: Unit): number {
  return left.name.localeCompare(right.name, "ru", { numeric: true });
}

export function DeviceAddWizard({
  objectId,
  gateways,
  rooms,
  units,
  initialPlace,
  initialUnitId,
  initialRoomId,
  lockScope,
  engineeringSystemId,
  asDialog,
  onClose,
}: {
  objectId: string;
  gateways: Gateway[];
  rooms: Room[];
  units: Unit[];
  initialPlace?: "OBJECT" | "STREET" | "ROOM";
  initialUnitId?: string;
  initialRoomId?: string;
  lockScope?: "house" | "object";
  engineeringSystemId?: string;
  asDialog?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const hubs = gateways.filter((item) => item.objectId === objectId);
  const houses = units.filter((item) => item.objectId === objectId).slice().sort(houseSort);
  const objectOnly = lockScope === "object" || initialPlace === "OBJECT" || Boolean(engineeringSystemId);
  const houseLocked = Boolean(initialUnitId);
  const [gatewayId, setGatewayId] = useState(hubs[0]?.id ?? "");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"pending" | "completed" | "error" | null>(null);
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [discover, setDiscover] = useState(false);
  const [picked, setPicked] = useState<FoundDevice | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeviceKind>(objectOnly ? "HEATING" : "LIGHTING");
  const [icon, setIcon] = useState(deviceIconOf(null, objectOnly ? "HEATING" : "LIGHTING"));
  const [iconColor, setIconColor] = useState<string | null>(null);
  const [houseQuery, setHouseQuery] = useState("");
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [channels, setChannels] = useState<DraftChannel[]>(channelsFromCaps(objectOnly ? "HEATING" : "LIGHTING"));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleHouses = useMemo(() => {
    const needle = houseQuery.trim().toLowerCase();
    return needle ? houses.filter((house) => house.name.toLowerCase().includes(needle)) : houses;
  }, [houses, houseQuery]);

  const roomsOfHouse = useMemo(() => {
    const ofHouse = rooms.filter((room) => room.objectId === objectId && room.unitId === unitId);
    if (ofHouse.length) return ofHouse;
    return rooms.filter((room) => room.objectId === objectId && (!unitId || !room.unitId));
  }, [rooms, objectId, unitId]);

  const selectedHouse = houses.find((house) => house.id === unitId) ?? null;

  useEffect(() => {
    if (objectOnly) return;
    if (roomId && roomsOfHouse.some((room) => room.id === roomId)) return;
    const street = roomsOfHouse.find((room) => room.kind === "STREET");
    const indoor = roomsOfHouse.find((room) => room.kind !== "STREET");
    const next = kind === "WEATHER" ? street ?? indoor : indoor ?? street;
    if (next) setRoomId(next.id);
  }, [objectOnly, roomId, roomsOfHouse, kind]);

  useEffect(() => {
    if (!scanId || scanStatus !== "pending") return;
    let live = true;
    const timer = window.setInterval(() => {
      void (async () => {
        const result = await runCommand(() => fetch(`/api/smart-home/devices/discover/${scanId}`));
        if (!live || !result.ok || !result.payload) return;
        const status = result.payload.status;
        if (status === "completed" || status === "error") {
          setScanStatus(status);
          setFound(Array.isArray(result.payload.devices) ? (result.payload.devices as FoundDevice[]) : []);
          setScanError(typeof result.payload.error === "string" ? result.payload.error : null);
        }
      })();
    }, 1500);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [scanId, scanStatus]);

  async function startScan() {
    if (!gatewayId) {
      setNotice("Выберите шлюз.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/smart-home/devices/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gatewayId }),
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setNotice(commandMessage(result.payload, "Не удалось начать поиск."));
      return;
    }
    setScanId(typeof result.payload?.scanId === "string" ? result.payload.scanId : null);
    setScanStatus((result.payload?.status as "pending") ?? "pending");
    setFound([]);
    setScanError(null);
  }

  function pickFound(device: FoundDevice) {
    if (device.alreadyRegistered) return;
    setPicked(device);
    const nextKind = inferKindFromCapabilities(device.channels.map((channel) => channel.capability).filter((item): item is string => Boolean(item)));
    setKind(nextKind);
    setIcon(deviceIconOf(null, nextKind));
    setName(device.model || device.externalId);
    setChannels(channelsFromFound(device));
  }

  function changeKind(next: DeviceKind) {
    setKind(next);
    setIcon((current) => (current === deviceIconOf(null, kind) ? deviceIconOf(null, next) : current));
    if (!picked) setChannels(channelsFromCaps(next));
  }

  async function save() {
    if (!name.trim()) {
      setNotice("Введите название.");
      return;
    }
    if (!objectOnly && !unitId) {
      setNotice("Выберите дом.");
      return;
    }
    if (!objectOnly && !roomId) {
      setNotice("Выберите помещение или улицу.");
      return;
    }
    const selectedRoom = rooms.find((room) => room.id === roomId);
    const resolvedPlace: "OBJECT" | "STREET" | "ROOM" = objectOnly ? "OBJECT" : selectedRoom?.kind === "STREET" ? "STREET" : "ROOM";
    setBusy(true);
    setNotice(null);
    const enabled = channels.filter((channel) => channel.enabled);
    const result = await runCommand(() =>
      fetch("/api/smart-home/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectId,
          gatewayId: gatewayId || undefined,
          name: name.trim(),
          kind,
          icon,
          iconColor,
          manufacturer: picked?.manufacturer ?? undefined,
          model: picked?.model ?? undefined,
          externalId: picked?.externalId ?? undefined,
          place: resolvedPlace,
          roomId: resolvedPlace === "OBJECT" ? null : roomId || null,
          unitId: resolvedPlace === "OBJECT" ? null : unitId || null,
          capabilities: enabled.map((channel) => channel.capability),
          channels,
          engineeringSystemId: engineeringSystemId || undefined,
        }),
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setNotice(commandMessage(result.payload, "Не удалось добавить устройство."));
      return;
    }
    onClose();
    router.refresh();
  }

  const title = objectOnly ? (engineeringSystemId ? "Устройство системы" : "Устройство объекта") : selectedHouse ? selectedHouse.name : "Устройство дома";

  const inner = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[16px] text-ink">{title}</p>
          <p className="mt-1 text-sm text-muted">Название, тип и место — этого достаточно.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={onClose}>
          Закрыть
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="block">
          <span className="text-sm text-muted">Название</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" autoFocus />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-muted">Тип</span>
            <Select value={kind} onChange={(event) => changeKind(event.target.value as DeviceKind)} wrapClassName="mt-2">
              {deviceKinds.map((item) => (
                <option key={item} value={item}>
                  {deviceLabel(item)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Шлюз</span>
            <Select value={gatewayId} onChange={(event) => setGatewayId(event.target.value)} wrapClassName="mt-2">
              <option value="">Без шлюза</option>
              {hubs.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <IconPicker value={icon} color={iconColor} kind={kind} onChange={setIcon} onColorChange={setIconColor} disabled={busy} />

        {objectOnly ? (
          <p className="text-sm text-muted">Общее устройство объекта. Жильцам не передаётся.</p>
        ) : (
          <div className="grid gap-4">
            {houseLocked ? (
              <p className="text-sm text-muted">{selectedHouse?.name ?? "Дом выбран."}</p>
            ) : (
              <div>
                <label className="block">
                  <span className="text-sm text-muted">Дом</span>
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
                      className={`btn btn-compact ${house.id === unitId ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => {
                        setUnitId(house.id);
                        setRoomId("");
                      }}
                    >
                      {house.name}
                    </button>
                  ))}
                </div>
                {visibleHouses.length > 16 ? <p className="mt-2 text-sm text-muted">Найдено {visibleHouses.length}. Уточните поиск.</p> : null}
                {houses.length === 0 ? <p className="mt-2 text-sm text-muted">Сначала добавьте дома в объекте.</p> : null}
              </div>
            )}
            <label className="block">
              <span className="text-sm text-muted">Помещение или улица</span>
              <Select value={roomId} onChange={(event) => setRoomId(event.target.value)} wrapClassName="mt-2" disabled={!unitId}>
                {!unitId ? <option value="">Сначала дом</option> : null}
                {unitId && roomsOfHouse.length === 0 ? <option value="">Нет помещений</option> : null}
                {roomsOfHouse.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.kind === "STREET" ? "Улица у дома" : room.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        )}

        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Добавить устройство
        </button>

        {hubs.length ? (
          <div>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setDiscover((current) => !current)}>
              {discover ? "Скрыть поиск на шлюзе" : "Найти на шлюзе"}
            </button>
            {discover ? (
              <div className="mt-4 space-y-3">
                <button type="button" className="btn btn-primary btn-compact" disabled={busy || !gatewayId} onClick={() => void startScan()}>
                  {scanStatus === "pending" ? "Ищем…" : "Найти"}
                </button>
                {scanStatus === "pending" ? <p className="text-sm text-muted">Ожидаем ответ шлюза.</p> : null}
                {scanStatus === "error" ? <p className="text-sm text-danger">{scanError ?? "Шлюз не ответил."}</p> : null}
                {scanStatus === "completed" && found.length === 0 ? <p className="text-sm text-muted">Устройства не найдены.</p> : null}
                {found.length ? (
                  <ul className="divide-y divide-line">
                    {found.map((device) => (
                      <li key={device.externalId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-[16px] text-ink">{device.model || device.externalId}</p>
                          <p className="text-sm text-muted">
                            {device.manufacturer ?? "—"} · {device.online ? "На связи" : "Нет связи"}
                          </p>
                        </div>
                        {device.alreadyRegistered ? (
                          <a href={`/admin/devices/${device.alreadyRegistered.deviceId}`} className="btn btn-secondary btn-compact">
                            Открыть
                          </a>
                        ) : (
                          <button type="button" className="btn btn-primary btn-compact" onClick={() => pickFound(device)}>
                            Выбрать
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}
    </>
  );

  if (asDialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
        <section
          className="panel fade-in max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] p-6 sm:rounded-[28px]"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {inner}
        </section>
      </div>
    );
  }

  return <section className="panel p-5">{inner}</section>;
}
