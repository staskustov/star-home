import { formatHumidity, formatTemperature } from "@/lib/format";
import { deviceLabel } from "@/server/device-kinds";
import { rememberReading, runDevice } from "@/server/devices";
import { recordAudit } from "@/server/operations";
import { newId, readOps, writeOps, type Device, type DeviceReading, type EngineeringSystemRecord, type GatewayAdapterKind } from "@/server/ops-store";
import { notifyIfAlert } from "@/server/smart-notices";
import { can, objectFor, objectsInScope, reaches, type StaffActor } from "@/server/rbac/decide";
import { text } from "@/server/schema";
import { placeName } from "@/server/security-post";
import type { DeviceWork, EngineeringBoard, EngineeringDevice, EngineeringSystem } from "@/types/engineering";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

const works: { value: DeviceWork; label: string }[] = [
  { value: "ON", label: "В работе" },
  { value: "OFF", label: "Выведено из работы" },
  { value: "FAULT", label: "Неисправно" },
];

const links: Record<GatewayAdapterKind, string> = {
  local: "Локальный адаптер",
  http: "HTTP",
  matter: "Matter",
  mqtt: "MQTT",
  modbus: "Modbus",
  onvif: "ONVIF",
  rs485: "RS-485",
  wirenboard: "Wiren Board",
  knx: "KNX",
  zigbee: "Zigbee",
  simulator: "Симулятор",
};

function workOf(device: Device): DeviceWork {
  return device.work ?? "ON";
}

function workLabel(work: DeviceWork): string {
  return works.find((item) => item.value === work)?.label ?? "В работе";
}

function readingOf(device: Device, readings: DeviceReading[]): string | null {
  const reading = readings.find((item) => item.deviceId === device.id);
  return reading ? `${formatTemperature(reading.temperatureC)} · ${formatHumidity(reading.humidityPercent)}` : null;
}

export function engineeringSystemIdOf(device: { metadata?: Record<string, unknown> }): string | null {
  const value = device.metadata?.engineeringSystemId;
  return typeof value === "string" && value ? value : null;
}

export function isEngineeringDevice(device: Device): boolean {
  return device.place === "OBJECT" || device.metadata?.engineering === true || Boolean(engineeringSystemIdOf(device));
}

function systemState(devices: Device[]): Pick<EngineeringSystem, "state" | "tone"> {
  if (devices.length === 0) return { state: "Не подключено", tone: "muted" };
  const faults = devices.filter((device) => workOf(device) === "FAULT").length;
  const off = devices.filter((device) => workOf(device) === "OFF").length;
  if (faults > 0) return { state: devices.length > 1 ? `${faults} из ${devices.length} неисправно` : "Неисправно", tone: "danger" };
  if (off > 0) return { state: devices.length > 1 ? `${devices.length - off} из ${devices.length} в работе` : "Выведено из работы", tone: "warning" };
  return { state: "В работе", tone: "success" };
}

function deviceRow(device: Device, readings: DeviceReading[]): EngineeringDevice {
  const work = workOf(device);
  return {
    id: device.id,
    name: device.name,
    kind: deviceLabel(device.kind),
    place: placeName(device.unitId),
    work,
    workLabel: workLabel(work),
    reading: readingOf(device, readings),
    link: links[device.adapter] ?? device.adapter,
  };
}

function systemsOf(objectId: string): EngineeringSystemRecord[] {
  return (readOps().engineeringSystems ?? [])
    .filter((system) => system.objectId === objectId)
    .slice()
    .sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name, "ru"));
}

function namedSystems(objectId: string, devices: Device[], readings: DeviceReading[]): EngineeringSystem[] {
  return systemsOf(objectId).map((system) => {
    const members = devices.filter((device) => engineeringSystemIdOf(device) === system.id);
    return { id: system.id, name: system.name, ...systemState(members), devices: members.map((device) => deviceRow(device, readings)) };
  });
}

export function engineeringBoard(actor: StaffActor): Success<EngineeringBoard> | Failure {
  if (!can(actor, "engineering.view")) return denied;
  const file = readOps();
  return {
    ok: true,
    value: {
      objects: objectsInScope(actor).map((object) => {
        const devices = file.devices.filter((device) => device.objectId === object.id && isEngineeringDevice(device) && reaches(actor, device));
        return {
          objectId: object.id,
          systems: namedSystems(object.id, devices, file.readings),
          meters: file.meters
            .filter((meter) => meter.objectId === object.id && reaches(actor, meter))
            .map((meter) => {
              const latest = file.meterReadings.filter((reading) => reading.meterId === meter.id).at(-1);
              return {
                id: meter.id,
                name: meter.name,
                place: placeName(meter.unitId),
                value: latest ? String(latest.value).replace(".", ",") : null,
                unit: meter.unit,
                at: latest?.at ?? null,
              };
            }),
        };
      }),
      can: {
        poll: can(actor, "engineering.command"),
        edit: can(actor, "engineering.edit"),
        create: can(actor, "engineering.edit"),
        createDevice: can(actor, "devices.create"),
      },
      works,
    },
  };
}

function engineeringDevice(actor: StaffActor, objectId: unknown, deviceId: unknown): Success<Device> | Failure {
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, status: 404, message: "Устройство не найдено" };
  const device = readOps().devices.find(
    (item) => item.id === deviceId && item.objectId === object.value.id && item.companyId === object.value.companyId && isEngineeringDevice(item),
  );
  if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
  if (!reaches(actor, device)) return denied;
  return { ok: true, value: device };
}

export function bindEngineeringSystem(objectId: string, value: unknown): string | null | Failure {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { ok: false, status: 400, message: "Система не найдена" };
  const system = systemsOf(objectId).find((item) => item.id === value);
  if (!system) return { ok: false, status: 400, message: "Система не найдена" };
  return system.id;
}

export function createEngineeringSystem(
  actor: StaffActor,
  input: { objectId: unknown; name: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "engineering.edit")) return denied;
  const object = objectFor(actor, input.objectId);
  if (!object.ok) return object;
  const name = text(input.name, 2, 80);
  if (!name) return { ok: false, status: 400, message: "Введите название системы" };
  const file = readOps();
  const siblings = (file.engineeringSystems ?? []).filter((system) => system.objectId === object.value.id);
  const next: EngineeringSystemRecord = {
    id: newId("esys"),
    companyId: object.value.companyId,
    objectId: object.value.id,
    name,
    sort: siblings.reduce((max, system) => Math.max(max, system.sort), 0) + 1,
  };
  file.engineeringSystems = [...(file.engineeringSystems ?? []), next];
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: object.value.id,
    action: "ENGINEERING_SYSTEM_CREATE",
    targetType: "engineering-system",
    targetId: next.id,
    target: name,
  });
  return { ok: true, value: { id: next.id } };
}

export function updateEngineeringSystem(
  actor: StaffActor,
  input: { systemId: unknown; name: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "engineering.edit")) return denied;
  if (typeof input.systemId !== "string" || !input.systemId) return { ok: false, status: 404, message: "Система не найдена" };
  const file = readOps();
  const system = (file.engineeringSystems ?? []).find((item) => item.id === input.systemId);
  if (!system) return { ok: false, status: 404, message: "Система не найдена" };
  const object = objectFor(actor, system.objectId);
  if (!object.ok) return object;
  const name = text(input.name, 2, 80);
  if (!name) return { ok: false, status: 400, message: "Введите название системы" };
  if (system.name === name) return { ok: true, value: { id: system.id } };
  const from = system.name;
  system.name = name;
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: system.objectId,
    action: "ENGINEERING_SYSTEM_EDIT",
    targetType: "engineering-system",
    targetId: system.id,
    target: name,
    changes: [{ field: "Название", from, to: name }],
  });
  return { ok: true, value: { id: system.id } };
}

export function removeEngineeringSystem(actor: StaffActor, systemId: unknown): Success<{ id: string }> | Failure {
  if (!can(actor, "engineering.edit")) return denied;
  if (typeof systemId !== "string" || !systemId) return { ok: false, status: 404, message: "Система не найдена" };
  const file = readOps();
  const system = (file.engineeringSystems ?? []).find((item) => item.id === systemId);
  if (!system) return { ok: false, status: 404, message: "Система не найдена" };
  const object = objectFor(actor, system.objectId);
  if (!object.ok) return object;
  file.engineeringSystems = (file.engineeringSystems ?? []).filter((item) => item.id !== system.id);
  for (const device of file.devices) {
    if (engineeringSystemIdOf(device) !== system.id) continue;
    const metadata = { ...(device.metadata ?? {}) };
    delete metadata.engineeringSystemId;
    device.metadata = metadata;
  }
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: system.objectId,
    action: "ENGINEERING_SYSTEM_DELETE",
    targetType: "engineering-system",
    targetId: system.id,
    target: system.name,
  });
  return { ok: true, value: { id: system.id } };
}

export async function pollDeviceFor(actor: StaffActor, objectId: unknown, deviceId: unknown): Promise<Success<{ confirmed: boolean; message: string }> | Failure> {
  if (!can(actor, "engineering.command")) return denied;
  const found = engineeringDevice(actor, objectId, deviceId);
  if (!found.ok) return found;
  const device = found.value;
  if (workOf(device) === "OFF") return { ok: false, status: 409, message: "Устройство выведено из работы" };
  const result = await runDevice(device, "READ");
  if (result.confirmed && result.reading) rememberReading(device.id, result.reading.temperatureC, result.reading.humidityPercent);
  recordAudit({
    actorUserId: actor.userId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "DEVICE_POLL",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    result: result.confirmed ? "SUCCESS" : "ERROR",
    reason: result.confirmed ? "" : "Нет подтверждения адаптера",
  });
  if (!result.confirmed) return { ok: true, value: { confirmed: false, message: "Не удалось подтвердить выполнение." } };
  const reading = result.reading ? `${formatTemperature(result.reading.temperatureC)} · ${formatHumidity(result.reading.humidityPercent)}` : null;
  return { ok: true, value: { confirmed: true, message: reading ? `Показания получены: ${reading}.` : "Устройство ответило." } };
}

export function setDeviceWorkFor(actor: StaffActor, objectId: unknown, deviceId: unknown, work: unknown): Success<{ work: DeviceWork }> | Failure {
  if (!can(actor, "engineering.edit")) return denied;
  if (!works.some((item) => item.value === work)) return { ok: false, status: 400, message: "Неизвестный статус" };
  const found = engineeringDevice(actor, objectId, deviceId);
  if (!found.ok) return found;
  const next = work as DeviceWork;
  const from = workOf(found.value);
  if (from === next) return { ok: true, value: { work: next } };
  const file = readOps();
  const device = file.devices.find((item) => item.id === found.value.id);
  if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
  device.work = next;
  writeOps(file);
  notifyIfAlert({
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    name: device.name,
    before: { work: from },
    after: { work: next },
  });
  recordAudit({
    actorUserId: actor.userId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "DEVICE_STATUS",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    changes: [{ field: "Статус", from: workLabel(from), to: workLabel(next) }],
  });
  return { ok: true, value: { work: next } };
}
