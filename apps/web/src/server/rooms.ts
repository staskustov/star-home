import {
  createCatalogRoom,
  deleteCatalogRoom,
  findRoom,
  isRoomKind,
  roomsOf,
  updateCatalogRoom,
  type CatalogRoom,
  type RoomKind,
} from "@/server/catalog-store";
import { readOps } from "@/server/ops-store";
import { recordAudit } from "@/server/operations";
import { can, unitFor, type StaffActor } from "@/server/rbac/decide";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

export type RoomRow = {
  id: string;
  unitId: string;
  objectId: string;
  name: string;
  kind: RoomKind;
  floor: number | null;
};

function asRow(room: CatalogRoom): RoomRow {
  return {
    id: room.id,
    unitId: room.unitId,
    objectId: room.objectId,
    name: room.name,
    kind: room.kind,
    floor: room.floor,
  };
}

function cleanName(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите название" };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: "Введите название" };
  if (name.length > 80) return { ok: false, status: 400, message: "Слишком длинное название" };
  return name;
}

function cleanKind(value: unknown): RoomKind | Failure {
  if (value === undefined || value === null || value === "") return "OTHER";
  if (!isRoomKind(value)) return { ok: false, status: 400, message: "Неизвестный тип помещения" };
  return value;
}

function cleanFloor(value: unknown, floors: number): number | null | Failure {
  if (value === undefined || value === null || value === "") return null;
  const floor = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(floor) || floor < 1 || floor > floors) {
    return { ok: false, status: 400, message: "Этаж не подходит к этажности дома" };
  }
  return floor;
}

function roomFor(actor: StaffActor, roomId: unknown): Success<CatalogRoom> | Failure {
  if (typeof roomId !== "string" || !roomId) return { ok: false, status: 400, message: "Помещение не найдено" };
  const room = findRoom(roomId);
  if (!room) return { ok: false, status: 404, message: "Помещение не найдено" };
  const unit = unitFor(actor, room.unitId);
  if (!unit.ok) return unit;
  return { ok: true, value: room };
}

export function roomsForUnit(actor: StaffActor, unitId: string): RoomRow[] {
  const unit = unitFor(actor, unitId);
  if (!unit.ok) return [];
  return roomsOf(unitId).map(asRow);
}

export function createRoom(
  actor: StaffActor,
  input: { unitId: unknown; name: unknown; kind?: unknown; floor?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.structure.edit")) return denied;
  const unit = unitFor(actor, input.unitId);
  if (!unit.ok) return unit;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const kind = cleanKind(input.kind);
  if (typeof kind !== "string") return kind;
  const floor = cleanFloor(input.floor, unit.value.floors ?? 1);
  if (floor && typeof floor !== "number") return floor;
  const room = createCatalogRoom({
    objectId: unit.value.objectId,
    unitId: unit.value.id,
    name,
    kind,
    floor: typeof floor === "number" ? floor : null,
  });
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: unit.value.objectId,
    buildingId: unit.value.buildingId,
    unitId: unit.value.id,
    action: "ROOM_CREATE",
    targetType: "room",
    targetId: room.id,
    target: `${unit.value.name} · ${name}`,
  });
  return { ok: true, value: { id: room.id } };
}

export function updateRoom(
  actor: StaffActor,
  input: { roomId: unknown; name: unknown; kind?: unknown; floor?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.structure.edit")) return denied;
  const found = roomFor(actor, input.roomId);
  if (!found.ok) return found;
  const unit = unitFor(actor, found.value.unitId);
  if (!unit.ok) return unit;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const kind = cleanKind(input.kind ?? found.value.kind);
  if (typeof kind !== "string") return kind;
  const floor = cleanFloor(input.floor === undefined ? found.value.floor : input.floor, unit.value.floors ?? 1);
  if (floor && typeof floor !== "number") return floor;
  const nextFloor = typeof floor === "number" ? floor : null;
  const changes = [
    ...(found.value.name !== name ? [{ field: "Название", from: found.value.name, to: name }] : []),
    ...(found.value.kind !== kind ? [{ field: "Тип", from: found.value.kind, to: kind }] : []),
    ...((found.value.floor ?? null) !== nextFloor
      ? [{ field: "Этаж", from: found.value.floor == null ? "" : String(found.value.floor), to: nextFloor == null ? "" : String(nextFloor) }]
      : []),
  ];
  updateCatalogRoom(found.value.id, { name, kind, floor: nextFloor });
  if (changes.length) {
    recordAudit({
      actorUserId: actor.userId,
      companyId: actor.companyId,
      objectId: found.value.objectId,
      buildingId: unit.value.buildingId,
      unitId: found.value.unitId,
      action: "ROOM_EDIT",
      targetType: "room",
      targetId: found.value.id,
      target: `${unit.value.name} · ${name}`,
      changes,
    });
  }
  return { ok: true, value: { id: found.value.id } };
}

export function removeRoom(actor: StaffActor, roomId: unknown): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.structure.edit")) return denied;
  const found = roomFor(actor, roomId);
  if (!found.ok) return found;
  const attached = readOps().devices.some((device) => device.roomId === found.value.id);
  if (attached) return { ok: false, status: 409, message: "Сначала отвяжите устройства от помещения." };
  const unit = unitFor(actor, found.value.unitId);
  deleteCatalogRoom(found.value.id);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: found.value.objectId,
    buildingId: unit.ok ? unit.value.buildingId : null,
    unitId: found.value.unitId,
    action: "ROOM_DELETE",
    targetType: "room",
    targetId: found.value.id,
    target: found.value.name,
  });
  return { ok: true, value: { id: found.value.id } };
}
