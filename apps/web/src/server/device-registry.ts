import { findObject, findRoom } from "@/server/catalog-store";
import { cleanCapabilities, type Capability } from "@/server/device-capabilities";
import { deviceKinds, deviceLabel, type DeviceKind } from "@/server/device-kinds";
import { recordAudit } from "@/server/operations";
import {
  gatewaysForObject,
  isGatewayAdapter,
  newId,
  normalizeDevice,
  readOps,
  writeOps,
  type Device,
  type DeviceAvailability,
  type Gateway,
  type GatewayAdapterKind,
  type GatewayStatus,
} from "@/server/ops-store";
import { can, objectFor, reaches, unitFor, type StaffActor } from "@/server/rbac/decide";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

export type RegistryDevice = {
  id: string;
  objectId: string;
  unitId: string | null;
  roomId: string | null;
  gatewayId: string | null;
  name: string;
  displayName: string;
  kind: DeviceKind;
  typeLabel: string;
  manufacturer: string | null;
  model: string | null;
  externalId: string | null;
  capabilities: Capability[];
  availability: DeviceAvailability;
  lastSeen: string | null;
  work: "ON" | "OFF" | "FAULT";
};

export type RegistryGateway = {
  id: string;
  objectId: string;
  unitId: string | null;
  name: string;
  adapter: GatewayAdapterKind;
  status: GatewayStatus;
  version: string | null;
  lastSeen: string | null;
  lastError: string | null;
  internalAddress: string | null;
  connectedDevices: number;
};

function cleanName(value: unknown, empty = "Введите название"): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: empty };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: empty };
  if (name.length > 80) return { ok: false, status: 400, message: "Слишком длинное название" };
  return name;
}

function cleanOptional(value: unknown, limit: number): string | null | Failure {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return { ok: false, status: 400, message: "Проверьте поле" };
  const text = value.trim();
  if (!text) return null;
  if (text.length > limit) return { ok: false, status: 400, message: "Слишком длинное значение" };
  return text;
}

function isKind(value: unknown): value is DeviceKind {
  return typeof value === "string" && (deviceKinds as readonly string[]).includes(value);
}

function asDevice(device: Device): RegistryDevice {
  const normalized = normalizeDevice({ ...device });
  return {
    id: normalized.id,
    objectId: normalized.objectId,
    unitId: normalized.unitId,
    roomId: normalized.roomId ?? null,
    gatewayId: normalized.gatewayId ?? null,
    name: normalized.name,
    displayName: normalized.displayName ?? normalized.name,
    kind: normalized.kind,
    typeLabel: deviceLabel(normalized.kind),
    manufacturer: normalized.manufacturer ?? null,
    model: normalized.model ?? null,
    externalId: normalized.externalId ?? null,
    capabilities: normalized.capabilities ?? [],
    availability: normalized.availability ?? "UNKNOWN",
    lastSeen: normalized.lastSeen ?? null,
    work: normalized.work === "FAULT" ? "FAULT" : normalized.work === "OFF" ? "OFF" : "ON",
  };
}

function asGateway(gateway: Gateway): RegistryGateway {
  return {
    id: gateway.id,
    objectId: gateway.objectId,
    unitId: gateway.unitId,
    name: gateway.name,
    adapter: gateway.adapter,
    status: gateway.status,
    version: gateway.version,
    lastSeen: gateway.lastSeen,
    lastError: gateway.lastError,
    internalAddress: gateway.internalAddress,
    connectedDevices: readOps().devices.filter((device) => device.gatewayId === gateway.id).length,
  };
}

function deviceFor(actor: StaffActor, deviceId: unknown): Success<Device> | Failure {
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, status: 400, message: "Устройство не найдено" };
  const device = readOps().devices.find((item) => item.id === deviceId && item.companyId === actor.companyId);
  if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
  if (!reaches(actor, device)) return denied;
  return { ok: true, value: device };
}

function gatewayFor(actor: StaffActor, gatewayId: unknown): Success<Gateway> | Failure {
  if (typeof gatewayId !== "string" || !gatewayId) return { ok: false, status: 400, message: "Шлюз не найден" };
  const gateway = readOps().gateways.find((item) => item.id === gatewayId && item.companyId === actor.companyId);
  if (!gateway) return { ok: false, status: 404, message: "Шлюз не найден" };
  const object = objectFor(actor, gateway.objectId, "part");
  if (!object.ok) return object;
  return { ok: true, value: gateway };
}

function bindUnit(actor: StaffActor, objectId: string, unitId: unknown): string | null | Failure {
  if (unitId === undefined || unitId === null || unitId === "") return null;
  const unit = unitFor(actor, unitId);
  if (!unit.ok) return unit;
  if (unit.value.objectId !== objectId) return { ok: false, status: 400, message: "Единица не принадлежит объекту" };
  return unit.value.id;
}

function bindRoom(actor: StaffActor, objectId: string, unitId: string | null, roomId: unknown): string | null | Failure {
  if (roomId === undefined || roomId === null || roomId === "") return null;
  if (typeof roomId !== "string") return { ok: false, status: 400, message: "Помещение не найдено" };
  const room = findRoom(roomId);
  if (!room || findObject(room.objectId)?.companyId !== actor.companyId) {
    return { ok: false, status: 404, message: "Помещение не найдено" };
  }
  if (room.objectId !== objectId) return { ok: false, status: 400, message: "Помещение не принадлежит объекту" };
  const unit = unitFor(actor, room.unitId);
  if (!unit.ok) return unit;
  if (unitId && room.unitId !== unitId) return { ok: false, status: 400, message: "Помещение принадлежит другой единице" };
  return room.id;
}

function bindGateway(actor: StaffActor, objectId: string, gatewayId: unknown): string | null | Failure {
  if (gatewayId === undefined || gatewayId === null || gatewayId === "") return null;
  const found = gatewayFor(actor, gatewayId);
  if (!found.ok) return found;
  if (found.value.objectId !== objectId) return { ok: false, status: 400, message: "Шлюз не принадлежит объекту" };
  return found.value.id;
}

export function listRegistryDevices(actor: StaffActor, objectId: unknown): Success<{ devices: RegistryDevice[] }> | Failure {
  if (!can(actor, "devices.view")) return denied;
  const object = objectFor(actor, objectId, "part");
  if (!object.ok) return object;
  return {
    ok: true,
    value: {
      devices: readOps()
        .devices.filter((device) => device.objectId === object.value.id && reaches(actor, device))
        .map(asDevice),
    },
  };
}

export function registerDevice(
  actor: StaffActor,
  input: {
    objectId: unknown;
    unitId?: unknown;
    roomId?: unknown;
    gatewayId?: unknown;
    name: unknown;
    kind: unknown;
    manufacturer?: unknown;
    model?: unknown;
    externalId?: unknown;
    capabilities?: unknown;
  },
): Success<{ id: string }> | Failure {
  if (!can(actor, "devices.create")) return denied;
  const object = objectFor(actor, input.objectId);
  if (!object.ok) return object;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  if (!isKind(input.kind)) return { ok: false, status: 400, message: "Выберите тип устройства" };
  const unitId = bindUnit(actor, object.value.id, input.unitId);
  if (unitId && typeof unitId !== "string") return unitId;
  const roomId = bindRoom(actor, object.value.id, typeof unitId === "string" ? unitId : null, input.roomId);
  if (roomId && typeof roomId !== "string") return roomId;
  const gatewayId = bindGateway(actor, object.value.id, input.gatewayId);
  if (gatewayId && typeof gatewayId !== "string") return gatewayId;
  const manufacturer = cleanOptional(input.manufacturer, 80);
  if (manufacturer && typeof manufacturer !== "string") return manufacturer;
  const model = cleanOptional(input.model, 80);
  if (model && typeof model !== "string") return model;
  const externalId = cleanOptional(input.externalId, 120);
  if (externalId && typeof externalId !== "string") return externalId;
  const device = normalizeDevice({
    id: newId("dev"),
    companyId: object.value.companyId,
    objectId: object.value.id,
    unitId: typeof unitId === "string" ? unitId : null,
    kind: input.kind,
    name,
    displayName: name,
    adapter: "local",
    work: "ON",
    gatewayId: typeof gatewayId === "string" ? gatewayId : null,
    roomId: typeof roomId === "string" ? roomId : null,
    manufacturer: typeof manufacturer === "string" ? manufacturer : null,
    model: typeof model === "string" ? model : null,
    externalId: typeof externalId === "string" ? externalId : null,
    capabilities: cleanCapabilities(input.capabilities, input.kind),
    availability: "UNKNOWN",
    updatedAt: new Date().toISOString(),
  });
  const file = readOps();
  file.devices.push(device);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: object.value.id,
    unitId: device.unitId,
    action: "DEVICE_CREATE",
    targetType: "device",
    targetId: device.id,
    target: name,
  });
  return { ok: true, value: { id: device.id } };
}

export function updateRegistryDevice(
  actor: StaffActor,
  input: {
    deviceId: unknown;
    name?: unknown;
    roomId?: unknown;
    gatewayId?: unknown;
    unitId?: unknown;
    manufacturer?: unknown;
    model?: unknown;
    externalId?: unknown;
    capabilities?: unknown;
  },
): Success<{ id: string }> | Failure {
  if (!can(actor, "devices.edit")) return denied;
  const found = deviceFor(actor, input.deviceId);
  if (!found.ok) return found;
  const file = readOps();
  const device = file.devices.find((item) => item.id === found.value.id);
  if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
  const name = input.name === undefined ? device.name : cleanName(input.name);
  if (typeof name !== "string") return name;
  const unitId = input.unitId === undefined ? device.unitId : bindUnit(actor, device.objectId, input.unitId);
  if (unitId && typeof unitId !== "string") return unitId;
  const nextUnit = unitId === null || typeof unitId === "string" ? unitId : device.unitId;
  const roomId = input.roomId === undefined ? (device.roomId ?? null) : bindRoom(actor, device.objectId, nextUnit, input.roomId);
  if (roomId && typeof roomId !== "string") return roomId;
  const gatewayId = input.gatewayId === undefined ? (device.gatewayId ?? null) : bindGateway(actor, device.objectId, input.gatewayId);
  if (gatewayId && typeof gatewayId !== "string") return gatewayId;
  const manufacturer = input.manufacturer === undefined ? (device.manufacturer ?? null) : cleanOptional(input.manufacturer, 80);
  if (manufacturer && typeof manufacturer !== "string") return manufacturer;
  const model = input.model === undefined ? (device.model ?? null) : cleanOptional(input.model, 80);
  if (model && typeof model !== "string") return model;
  const externalId = input.externalId === undefined ? (device.externalId ?? null) : cleanOptional(input.externalId, 120);
  if (externalId && typeof externalId !== "string") return externalId;
  const changes = [
    ...(device.name !== name ? [{ field: "Название", from: device.name, to: name }] : []),
    ...((device.roomId ?? null) !== (typeof roomId === "string" ? roomId : null)
      ? [{ field: "Помещение", from: device.roomId ?? "", to: typeof roomId === "string" ? roomId : "" }]
      : []),
    ...((device.gatewayId ?? null) !== (typeof gatewayId === "string" ? gatewayId : null)
      ? [{ field: "Шлюз", from: device.gatewayId ?? "", to: typeof gatewayId === "string" ? gatewayId : "" }]
      : []),
  ];
  device.name = name;
  device.displayName = name;
  device.unitId = nextUnit;
  device.roomId = typeof roomId === "string" ? roomId : null;
  device.gatewayId = typeof gatewayId === "string" ? gatewayId : null;
  device.manufacturer = typeof manufacturer === "string" ? manufacturer : null;
  device.model = typeof model === "string" ? model : null;
  device.externalId = typeof externalId === "string" ? externalId : null;
  if (input.capabilities !== undefined) device.capabilities = cleanCapabilities(input.capabilities, device.kind);
  device.updatedAt = new Date().toISOString();
  normalizeDevice(device);
  writeOps(file);
  if (changes.length || input.capabilities !== undefined) {
    recordAudit({
      actorUserId: actor.userId,
      companyId: actor.companyId,
      objectId: device.objectId,
      unitId: device.unitId,
      action: "DEVICE_EDIT",
      targetType: "device",
      targetId: device.id,
      target: name,
      changes,
    });
  }
  return { ok: true, value: { id: device.id } };
}

export function removeRegistryDevice(actor: StaffActor, deviceId: unknown): Success<{ id: string }> | Failure {
  if (!can(actor, "devices.delete")) return denied;
  const found = deviceFor(actor, deviceId);
  if (!found.ok) return found;
  const file = readOps();
  file.removedDeviceIds ??= [];
  file.devices = file.devices.filter((item) => item.id !== found.value.id);
  if (!file.removedDeviceIds.includes(found.value.id)) file.removedDeviceIds.push(found.value.id);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: found.value.objectId,
    unitId: found.value.unitId,
    action: "DEVICE_DELETE",
    targetType: "device",
    targetId: found.value.id,
    target: found.value.name,
  });
  return { ok: true, value: { id: found.value.id } };
}

export function listRegistryGateways(actor: StaffActor, objectId: unknown): Success<{ gateways: RegistryGateway[] }> | Failure {
  if (!can(actor, "engineering.view")) return denied;
  const object = objectFor(actor, objectId, "part");
  if (!object.ok) return object;
  return { ok: true, value: { gateways: gatewaysForObject(object.value.id).map(asGateway) } };
}

export function createGateway(
  actor: StaffActor,
  input: { objectId: unknown; unitId?: unknown; name: unknown; adapter?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "devices.create")) return denied;
  const object = objectFor(actor, input.objectId);
  if (!object.ok) return object;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const adapter = input.adapter === undefined || input.adapter === "" ? "local" : input.adapter;
  if (!isGatewayAdapter(adapter)) return { ok: false, status: 400, message: "Неизвестный адаптер шлюза" };
  const unitId = bindUnit(actor, object.value.id, input.unitId);
  if (unitId && typeof unitId !== "string") return unitId;
  const gateway: Gateway = {
    id: newId("gw"),
    companyId: object.value.companyId,
    objectId: object.value.id,
    unitId: typeof unitId === "string" ? unitId : null,
    name,
    adapter,
    status: "OFFLINE",
    version: null,
    lastSeen: null,
    lastError: null,
    internalAddress: null,
    metadata: {},
  };
  const file = readOps();
  file.gateways.push(gateway);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: object.value.id,
    unitId: gateway.unitId,
    action: "GATEWAY_CREATE",
    targetType: "gateway",
    targetId: gateway.id,
    target: name,
  });
  return { ok: true, value: { id: gateway.id } };
}

export function updateGateway(
  actor: StaffActor,
  input: { gatewayId: unknown; name?: unknown; adapter?: unknown; unitId?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "devices.edit")) return denied;
  const found = gatewayFor(actor, input.gatewayId);
  if (!found.ok) return found;
  const file = readOps();
  const gateway = file.gateways.find((item) => item.id === found.value.id);
  if (!gateway) return { ok: false, status: 404, message: "Шлюз не найден" };
  const name = input.name === undefined ? gateway.name : cleanName(input.name);
  if (typeof name !== "string") return name;
  const adapter = input.adapter === undefined ? gateway.adapter : input.adapter;
  if (!isGatewayAdapter(adapter)) return { ok: false, status: 400, message: "Неизвестный адаптер шлюза" };
  const unitId = input.unitId === undefined ? gateway.unitId : bindUnit(actor, gateway.objectId, input.unitId);
  if (unitId && typeof unitId !== "string") return unitId;
  gateway.name = name;
  gateway.adapter = adapter;
  gateway.unitId = unitId === null || typeof unitId === "string" ? unitId : gateway.unitId;
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: gateway.objectId,
    unitId: gateway.unitId,
    action: "GATEWAY_EDIT",
    targetType: "gateway",
    targetId: gateway.id,
    target: name,
  });
  return { ok: true, value: { id: gateway.id } };
}

export function removeGateway(actor: StaffActor, gatewayId: unknown): Success<{ id: string }> | Failure {
  if (!can(actor, "devices.delete")) return denied;
  const found = gatewayFor(actor, gatewayId);
  if (!found.ok) return found;
  const attached = readOps().devices.some((device) => device.gatewayId === found.value.id);
  if (attached) return { ok: false, status: 409, message: "Сначала отвяжите устройства от шлюза." };
  const file = readOps();
  file.gateways = file.gateways.filter((item) => item.id !== found.value.id);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: found.value.objectId,
    unitId: found.value.unitId,
    action: "GATEWAY_DELETE",
    targetType: "gateway",
    targetId: found.value.id,
    target: found.value.name,
  });
  return { ok: true, value: { id: found.value.id } };
}

