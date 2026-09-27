"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deviceKinds, deviceLabel, inferKindFromCapabilities, type DeviceKind } from "@/server/device-kinds";
import { capabilitiesFor, type Capability } from "@/server/device-capabilities";
import { displayNameForCapability, unitForCapability } from "@/server/device-channels";
import { formatChannelValue } from "@/lib/format";
import { commandMessage, runCommand } from "@/lib/command";

type Gateway = { id: string; objectId: string; name: string; adapter: string; status: string };
type Room = { id: string; objectId: string; unitId: string; unitName: string; name: string };
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

const steps = ["Источник", "Устройство", "Место", "Каналы", "Проверка"] as const;

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

export function DeviceAddWizard({
  objectId,
  gateways,
  rooms,
  units,
  initialPlace,
  initialUnitId,
  initialRoomId,
  onClose,
}: {
  objectId: string;
  gateways: Gateway[];
  rooms: Room[];
  units: Unit[];
  initialPlace?: "OBJECT" | "STREET" | "ROOM";
  initialUnitId?: string;
  initialRoomId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const hubs = gateways.filter((item) => item.objectId === objectId);
  const houses = units.filter((item) => item.objectId === objectId);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<"discover" | "manual" | null>(null);
  const [gatewayId, setGatewayId] = useState(hubs[0]?.id ?? "");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"pending" | "completed" | "error" | null>(null);
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoundDevice | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeviceKind>("CLIMATE");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [externalId, setExternalId] = useState("");
  const [place, setPlace] = useState<"OBJECT" | "STREET" | "ROOM">(initialPlace ?? "ROOM");
  const [unitId, setUnitId] = useState(initialUnitId ?? houses[0]?.id ?? "");
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [channels, setChannels] = useState<DraftChannel[]>(channelsFromCaps("CLIMATE"));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roomsOfHouse = useMemo(() => {
    const ofHouse = rooms.filter((room) => room.objectId === objectId && room.unitId === unitId);
    if (ofHouse.length) return ofHouse;
    return rooms.filter((room) => room.objectId === objectId && (!unitId || !room.unitId));
  }, [rooms, objectId, unitId]);

  useEffect(() => {
    if (!roomId && roomsOfHouse[0]) setRoomId(roomsOfHouse[0].id);
  }, [roomId, roomsOfHouse]);

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

  function chooseSource(next: "discover" | "manual") {
    setSource(next);
    setNotice(null);
    if (next === "manual") {
      setName("");
      setKind("CLIMATE");
      setChannels(channelsFromCaps("CLIMATE"));
      setStep(1);
      return;
    }
    setStep(1);
  }

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
    setName(device.model || device.externalId);
    setManufacturer(device.manufacturer ?? "");
    setModel(device.model ?? "");
    setExternalId(device.externalId);
    setChannels(channelsFromFound(device));
    if (nextKind === "WEATHER") setPlace("STREET");
    setStep(2);
  }

  function changeKind(next: DeviceKind) {
    setKind(next);
    if (!picked) setChannels(channelsFromCaps(next));
    if (next === "WEATHER") setPlace("STREET");
  }

  async function save() {
    if (!name.trim()) {
      setNotice("Введите название.");
      return;
    }
    if (place === "ROOM" && !roomId) {
      setNotice("Выберите помещение.");
      return;
    }
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
          manufacturer: manufacturer.trim() || undefined,
          model: model.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          externalId: externalId.trim() || undefined,
          place,
          roomId: place === "ROOM" ? roomId : null,
          unitId: place === "ROOM" ? unitId : null,
          capabilities: enabled.map((channel) => channel.capability),
          channels,
        }),
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setNotice(commandMessage(result.payload, "Не удалось добавить устройство."));
      return;
    }
    const id = typeof result.payload?.id === "string" ? result.payload.id : null;
    onClose();
    router.refresh();
    if (id) router.push(`/admin/devices/${id}`);
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[16px] text-ink">Добавить устройство</p>
          <p className="mt-1 text-sm text-muted">{steps[step]}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={onClose}>
          Закрыть
        </button>
      </div>
      <ol className="mt-4 flex flex-wrap gap-2 text-[13px] text-muted">
        {steps.map((label, index) => (
          <li key={label} className={index === step ? "text-ink" : undefined}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" className="btn btn-primary" onClick={() => chooseSource("discover")}>
            Найти локальные устройства
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => chooseSource("manual")}>
            Добавить вручную
          </button>
        </div>
      ) : null}

      {step === 1 && source === "discover" ? (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm text-muted">Шлюз</span>
            <select value={gatewayId} onChange={(event) => setGatewayId(event.target.value)} className="control mt-2">
              {hubs.length === 0 ? <option value="">Нет шлюзов</option> : null}
              {hubs.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name} · {gateway.adapter}
                </option>
              ))}
            </select>
          </label>
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
                      {device.manufacturer ?? "—"} · {device.online ? "На связи" : "Нет связи"} · {device.channels.length} канала
                    </p>
                    <p className="mt-1 text-sm text-muted">{device.channels.map((channel) => channel.displayName).join(" · ")}</p>
                  </div>
                  {device.alreadyRegistered ? (
                    <a href={`/admin/devices/${device.alreadyRegistered.deviceId}`} className="btn btn-secondary btn-compact">
                      Открыть устройство
                    </a>
                  ) : (
                    <button type="button" className="btn btn-primary btn-compact" onClick={() => pickFound(device)}>
                      Добавить
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {step === 1 && source === "manual" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm text-muted">Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Тип</span>
            <select value={kind} onChange={(event) => changeKind(event.target.value as DeviceKind)} className="control mt-2">
              {deviceKinds.map((item) => (
                <option key={item} value={item}>
                  {deviceLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Шлюз</span>
            <select value={gatewayId} onChange={(event) => setGatewayId(event.target.value)} className="control mt-2">
              <option value="">Без шлюза</option>
              {hubs.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Производитель</span>
            <input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} className="control mt-2" />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Модель</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} className="control mt-2" />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Серийный номер</span>
            <input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} className="control mt-2" />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Внешний id</span>
            <input value={externalId} onChange={(event) => setExternalId(event.target.value)} className="control mt-2" />
          </label>
          <div className="sm:col-span-2">
            <button type="button" className="btn btn-primary btn-compact" onClick={() => setStep(2)}>
              Дальше
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-5 grid gap-4">
          <label className="block">
            <span className="text-sm text-muted">Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["ROOM", "OBJECT", "STREET"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`btn btn-compact ${place === item ? "btn-primary" : "btn-secondary"}`}
                disabled={kind === "WEATHER" && item !== "STREET"}
                onClick={() => setPlace(item)}
              >
                {item === "ROOM" ? "Дом и помещение" : item === "OBJECT" ? "Объект целиком" : "Улица посёлка"}
              </button>
            ))}
          </div>
          {place === "ROOM" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm text-muted">Дом</span>
                <select
                  value={unitId}
                  onChange={(event) => {
                    setUnitId(event.target.value);
                    setRoomId("");
                  }}
                  className="control mt-2"
                >
                  {houses.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted">Помещение</span>
                <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className="control mt-2">
                  {roomsOfHouse.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <button type="button" className="btn btn-primary btn-compact" onClick={() => setStep(3)}>
            Дальше
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-5 space-y-3">
          {channels.map((channel) => (
            <label key={channel.capability} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={channel.enabled}
                onChange={(event) =>
                  setChannels((current) =>
                    current.map((item) => (item.capability === channel.capability ? { ...item, enabled: event.target.checked } : item)),
                  )
                }
              />
              <input
                value={channel.displayName}
                onChange={(event) =>
                  setChannels((current) =>
                    current.map((item) => (item.capability === channel.capability ? { ...item, displayName: event.target.value } : item)),
                  )
                }
                className="control"
              />
              <span className="w-28 shrink-0 text-sm text-muted">{formatChannelValue(channel.value, channel.unit)}</span>
            </label>
          ))}
          <button type="button" className="btn btn-primary btn-compact" onClick={() => setStep(4)}>
            Дальше
          </button>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="mt-5 space-y-4">
          <ul className="divide-y divide-line">
            {channels
              .filter((channel) => channel.enabled)
              .map((channel) => (
                <li key={channel.capability} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-[16px] text-ink">{channel.displayName}</span>
                  <span className="text-sm text-muted">
                    {formatChannelValue(channel.value, channel.unit)} · {channel.value == null ? "Нет данных" : "данные поступают"}
                  </span>
                </li>
              ))}
          </ul>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            Добавить устройство
          </button>
        </div>
      ) : null}

      {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}
    </section>
  );
}
