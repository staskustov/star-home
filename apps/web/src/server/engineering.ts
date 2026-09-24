import { formatHumidity, formatTemperature } from "@/lib/format";
import { deviceLabel, type DeviceKind } from "@/server/device-kinds";
import { rememberReading, runDevice } from "@/server/devices";
import { recordAudit } from "@/server/operations";
import { readOps, writeOps, type Device, type DeviceReading } from "@/server/ops-store";
import { can, objectFor, objectsInScope, reaches, type StaffActor } from "@/server/rbac/decide";
import { placeName } from "@/server/security-post";
import type { DeviceWork, EngineeringBoard, EngineeringDevice, EngineeringSystem } from "@/types/engineering";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

const systems: { id: string; name: string; kinds: readonly DeviceKind[] }[] = [
  { id: "heat", name: "Климат и отопление", kinds: ["CLIMATE", "HEATING"] },
  { id: "water", name: "Вода и протечки", kinds: ["WATER", "LEAK", "IRRIGATION"] },
  { id: "power", name: "Электричество и свет", kinds: ["POWER", "LIGHTING", "CURTAIN"] },
  { id: "fire", name: "Пожарная безопасность", kinds: ["SMOKE", "FIRE"] },
];

const engineeringKinds = new Set<string>(systems.flatMap((system) => system.kinds));

const works: { value: DeviceWork; label: string }[] = [
  { value: "ON", label: "В работе" },
  { value: "OFF", label: "Выведено из работы" },
  { value: "FAULT", label: "Неисправно" },
];

const links: Record<Device["adapter"], string> = {
  local: "Локальный адаптер",
  http: "HTTP",
  matter: "Matter",
  mqtt: "MQTT",
  modbus: "Modbus",
  onvif: "ONVIF",
  rs485: "RS-485",
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

export function engineeringBoard(actor: StaffActor): Success<EngineeringBoard> | Failure {
  if (!can(actor, "engineering.view")) return denied;
  const file = readOps();
  return {
    ok: true,
    value: {
      objects: objectsInScope(actor).map((object) => {
        const devices = file.devices.filter((device) => device.objectId === object.id && engineeringKinds.has(device.kind) && reaches(actor, device));
        return {
          objectId: object.id,
          systems: systems.map((system) => {
            const members = devices.filter((device) => system.kinds.includes(device.kind));
            return { id: system.id, name: system.name, ...systemState(members), devices: members.map((device) => deviceRow(device, file.readings)) };
          }),
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
      can: { poll: can(actor, "engineering.command"), edit: can(actor, "engineering.edit") },
      works,
    },
  };
}

function engineeringDevice(actor: StaffActor, objectId: unknown, deviceId: unknown): Success<Device> | Failure {
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, status: 404, message: "Устройство не найдено" };
  const device = readOps().devices.find(
    (item) => item.id === deviceId && item.objectId === object.value.id && item.companyId === object.value.companyId && engineeringKinds.has(item.kind),
  );
  if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
  if (!reaches(actor, device)) return denied;
  return { ok: true, value: device };
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
