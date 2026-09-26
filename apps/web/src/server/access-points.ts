import { isOpener } from "@/server/device-kinds";
import { recordAudit } from "@/server/operations";
import { newId, normalizeDevice, readOps, writeOps, type Device } from "@/server/ops-store";
import { can, objectFor, reaches, type StaffActor } from "@/server/rbac/decide";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

export type AccessPointRow = {
  id: string;
  objectId: string;
  name: string;
  endpoint: string;
  latch: "OPEN" | "CLOSED";
  work: "ON" | "OFF" | "FAULT";
  status: string;
};

function cleanName(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите название" };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: "Введите название" };
  if (name.length > 80) return { ok: false, status: 400, message: "Слишком длинное название" };
  return name;
}

function cleanApi(value: unknown): string | Failure {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return { ok: false, status: 400, message: "Проверьте API" };
  const api = value.trim();
  if (!api) return "";
  if (api.length > 400) return { ok: false, status: 400, message: "Слишком длинный адрес API" };
  if (!/^https?:\/\//i.test(api)) return { ok: false, status: 400, message: "API: укажите http:// или https://" };
  return api;
}

function statusOf(device: Device): string {
  if (device.work === "FAULT") return "Неисправно";
  if (device.work === "OFF") return "Отключено";
  return device.latch === "OPEN" ? "Открыто" : "Закрыто";
}

function asRow(device: Device): AccessPointRow {
  return {
    id: device.id,
    objectId: device.objectId,
    name: device.name,
    endpoint: device.endpoint ?? "",
    latch: device.latch === "OPEN" ? "OPEN" : "CLOSED",
    work: device.work === "FAULT" ? "FAULT" : device.work === "OFF" ? "OFF" : "ON",
    status: statusOf(device),
  };
}

function pointFor(actor: StaffActor, objectId: unknown, pointId: unknown): Success<Device> | Failure {
  if (typeof pointId !== "string" || !pointId) return { ok: false, status: 400, message: "Точка доступа не найдена" };
  const hinted = typeof objectId === "string" && objectId ? objectId : "";
  const device = readOps().devices.find(
    (item) =>
      item.id === pointId &&
      item.companyId === actor.companyId &&
      isOpener(item.kind) &&
      (!hinted || item.objectId === hinted),
  );
  if (!device) return { ok: false, status: 404, message: "Точка доступа не найдена" };
  const object = objectFor(actor, device.objectId, "part");
  if (!object.ok) return object;
  if (!reaches(actor, device)) return denied;
  return { ok: true, value: device };
}

export function accessPointsFor(actor: StaffActor, objectId: string): AccessPointRow[] {
  return readOps()
    .devices.filter((device) => device.objectId === objectId && isOpener(device.kind) && reaches(actor, device))
    .map(asRow);
}

export function createAccessPoint(
  actor: StaffActor,
  input: { objectId: unknown; name: unknown; api?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "access.points.manage")) return denied;
  const object = objectFor(actor, input.objectId);
  if (!object.ok) return object;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const endpoint = cleanApi(input.api);
  if (typeof endpoint !== "string") return endpoint;
  const device = normalizeDevice({
    id: newId("dev"),
    companyId: object.value.companyId,
    objectId: object.value.id,
    unitId: null,
    kind: "GATE",
    name,
    adapter: endpoint ? "http" : "local",
    endpoint: endpoint || undefined,
    work: "ON",
    latch: "CLOSED",
  });
  const file = readOps();
  file.devices.push(device);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: object.value.id,
    action: "ACCESS_POINT_CREATE",
    targetType: "device",
    targetId: device.id,
    target: name,
  });
  return { ok: true, value: { id: device.id } };
}

export function updateAccessPoint(
  actor: StaffActor,
  input: { objectId: unknown; pointId: unknown; name: unknown; api?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "access.points.manage")) return denied;
  const found = pointFor(actor, input.objectId, input.pointId);
  if (!found.ok) return found;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const endpoint = cleanApi(input.api);
  if (typeof endpoint !== "string") return endpoint;
  const file = readOps();
  const device = file.devices.find((item) => item.id === found.value.id);
  if (!device) return { ok: false, status: 404, message: "Точка доступа не найдена" };
  const changes = [
    ...(device.name !== name ? [{ field: "Название", from: device.name, to: name }] : []),
    ...((device.endpoint ?? "") !== endpoint ? [{ field: "API", from: device.endpoint ?? "", to: endpoint }] : []),
  ];
  device.name = name;
  device.endpoint = endpoint || undefined;
  device.adapter = endpoint ? "http" : "local";
  writeOps(file);
  if (changes.length) {
    recordAudit({
      actorUserId: actor.userId,
      companyId: actor.companyId,
      objectId: device.objectId,
      action: "ACCESS_POINT_EDIT",
      targetType: "device",
      targetId: device.id,
      target: name,
      changes,
    });
  }
  return { ok: true, value: { id: device.id } };
}

export function removeAccessPoint(actor: StaffActor, objectId: unknown, pointId: unknown): Success<{ id: string }> | Failure {
  if (!can(actor, "access.points.manage")) return denied;
  const found = pointFor(actor, objectId, pointId);
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
    action: "ACCESS_POINT_DELETE",
    targetType: "device",
    targetId: found.value.id,
    target: found.value.name,
  });
  return { ok: true, value: { id: found.value.id } };
}
