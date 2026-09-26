import { objectPresentation } from "@/lib/object-presentation";
import {
  createCatalogBuilding,
  createCatalogObject,
  createCatalogUnit,
  deleteCatalogBuilding,
  deleteCatalogObject,
  deleteCatalogUnit,
  findBuilding,
  findObject,
  readTree,
  roomsOf,
  unitIdsOf,
  unitIdsOfBuilding,
  updateCatalogBuilding,
  updateCatalogObject,
  updateCatalogUnit,
} from "@/server/catalog-store";
import type { AuditInput } from "@/server/audit-store";
import { buildingHasStaff, objectHasAssignments, unitHasAssignment } from "@/server/directory";
import { recordAudit } from "@/server/operations";
import { can, companyWide, objectFor, unitFor, wholeObject, type StaffActor } from "@/server/rbac/decide";
import type { Permission } from "@/server/rbac/permissions";
import type { CatalogTree, CatalogUnitNode } from "@/types/catalog";
import { objectTypes, type ObjectType } from "@/types/domain";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

function cleanText(value: unknown, emptyMessage: string): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: emptyMessage };
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, status: 400, message: emptyMessage };
  if (text.length > 80) return { ok: false, status: 400, message: "Слишком длинное название" };
  return text;
}

function cleanAddress(value: unknown): string | Failure {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return { ok: false, status: 400, message: "Проверьте адрес" };
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > 160) return { ok: false, status: 400, message: "Слишком длинный адрес" };
  return text;
}

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

function note(actor: StaffActor, action: string, entry: Omit<AuditInput, "actorUserId" | "companyId" | "action">): void {
  recordAudit({ actorUserId: actor.userId, companyId: actor.companyId, action, ...entry });
}

function ownObject(
  actor: StaffActor,
  objectId: string,
  permission: Permission,
  reach: "part" | "whole" = "whole",
): Success<NonNullable<ReturnType<typeof findObject>>> | Failure {
  if (!can(actor, permission)) return denied;
  return objectFor(actor, objectId, reach);
}

function unitNode(unit: { id: string; name: string; number: string; areaM2?: number | null; floors?: number; plans?: { floor: number }[] }): CatalogUnitNode {
  return {
    id: unit.id,
    name: unit.name,
    number: unit.number,
    areaM2: unit.areaM2 ?? null,
    floors: unit.floors ?? 1,
    planFloors: (unit.plans ?? []).filter((plan) => plan.floor >= 1).map((plan) => plan.floor),
    roomCount: roomsOf(unit.id).length,
    canDelete: !unitHasAssignment(unit.id),
  };
}

export function treeFor(actor: StaffActor, objectId: string): Success<CatalogTree> | Failure {
  const owned = ownObject(actor, objectId, "objects.view", "part");
  if (!owned.ok) return owned;
  const tree = readTree(objectId);
  if (!tree) return { ok: false, status: 404, message: "Объект не найден" };
  const whole = wholeObject(actor);
  const value: CatalogTree = {
    object: {
      id: tree.object.id,
      name: tree.object.name,
      type: tree.object.type,
      address: tree.object.address,
      canDelete: whole && can(actor, "objects.delete") && !objectHasAssignments(objectId, unitIdsOf(objectId)),
    },
    buildings: tree.buildings
      ? tree.buildings
          .filter((building) => whole || building.id === actor.scope.buildingId)
          .map((building) => ({
          id: building.id,
          name: building.name,
          number: building.number,
          units: building.units.map(unitNode),
        }))
      : null,
    units: tree.units ? tree.units.map(unitNode) : null,
    can: {
      edit: whole && can(actor, "objects.edit"),
      structure: can(actor, "objects.structure.edit"),
      buildings: whole && can(actor, "objects.structure.edit"),
      remove: whole && can(actor, "objects.delete"),
    },
  };
  return { ok: true, value };
}

export function createObject(
  actor: StaffActor,
  input: { name: unknown; type: unknown; address: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.create") || !companyWide(actor)) return denied;
  const name = cleanText(input.name, "Введите название");
  if (typeof name !== "string") return name;
  if (typeof input.type !== "string" || !objectTypes.includes(input.type as ObjectType)) {
    return { ok: false, status: 400, message: "Выберите тип объекта" };
  }
  const address = cleanAddress(input.address);
  if (typeof address !== "string") return address;
  const created = createCatalogObject({
    companyId: actor.companyId,
    name,
    type: input.type as ObjectType,
    address,
  });
  note(actor, "OBJECT_CREATE", { objectId: created.id, targetType: "object", targetId: created.id, target: name });
  return { ok: true, value: { id: created.id } };
}

export function updateObject(
  actor: StaffActor,
  objectId: string,
  input: { name: unknown; address: unknown },
): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId, "objects.edit");
  if (!owned.ok) return owned;
  const name = cleanText(input.name, "Введите название");
  if (typeof name !== "string") return name;
  const address = cleanAddress(input.address);
  if (typeof address !== "string") return address;
  const changes = [
    ...(owned.value.name !== name ? [{ field: "Название", from: owned.value.name, to: name }] : []),
    ...(owned.value.address !== address ? [{ field: "Адрес", from: owned.value.address, to: address }] : []),
  ];
  updateCatalogObject(objectId, { name, address });
  if (changes.length) note(actor, "OBJECT_EDIT", { objectId, targetType: "object", targetId: objectId, target: name, changes });
  return { ok: true, value: { id: objectId } };
}

export function removeObject(actor: StaffActor, objectId: string): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId, "objects.delete");
  if (!owned.ok) return owned;
  if (objectHasAssignments(objectId, unitIdsOf(objectId))) {
    return { ok: false, status: 409, message: "Сначала уберите доступ людей к этому объекту." };
  }
  deleteCatalogObject(objectId);
  note(actor, "OBJECT_DELETE", { objectId, targetType: "object", targetId: objectId, target: owned.value.name });
  return { ok: true, value: { id: objectId } };
}

export function createBuilding(actor: StaffActor, objectId: string, name: unknown): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId, "objects.structure.edit");
  if (!owned.ok) return owned;
  if (!objectPresentation[owned.value.type].usesBuildings) {
    return { ok: false, status: 400, message: "У этого типа нет корпусов" };
  }
  const title = cleanText(name, "Введите название");
  if (typeof title !== "string") return title;
  const building = createCatalogBuilding(objectId, title);
  note(actor, "BUILDING_CREATE", { objectId, buildingId: building.id, targetType: "building", targetId: building.id, target: `${owned.value.name} · ${title}` });
  return { ok: true, value: { id: building.id } };
}

export function updateBuilding(actor: StaffActor, buildingId: string, name: unknown): Success<{ id: string }> | Failure {
  const building = findBuilding(buildingId);
  if (!building) return { ok: false, status: 404, message: "Корпус не найден" };
  const owned = ownObject(actor, building.objectId, "objects.structure.edit", "part");
  if (!owned.ok) return owned;
  if (!wholeObject(actor) && building.id !== actor.scope.buildingId) return denied;
  const title = cleanText(name, "Введите название");
  if (typeof title !== "string") return title;
  const changes = building.name !== title ? [{ field: "Название", from: building.name, to: title }] : [];
  updateCatalogBuilding(buildingId, title);
  if (changes.length) {
    note(actor, "BUILDING_EDIT", {
      objectId: owned.value.id,
      buildingId,
      targetType: "building",
      targetId: buildingId,
      target: `${owned.value.name} · ${title}`,
      changes,
    });
  }
  return { ok: true, value: { id: buildingId } };
}

export function removeBuilding(actor: StaffActor, buildingId: string): Success<{ id: string }> | Failure {
  const building = locateBuilding(buildingId);
  if (!building) return { ok: false, status: 404, message: "Корпус не найден" };
  const owned = ownObject(actor, building.objectId, "objects.structure.edit");
  if (!owned.ok) return owned;
  if (unitIdsOfBuilding(buildingId).some((unitId) => unitHasAssignment(unitId))) {
    return { ok: false, status: 409, message: "В корпусе есть занятые единицы." };
  }
  if (buildingHasStaff(buildingId)) return { ok: false, status: 409, message: "За корпусом закреплены сотрудники." };
  const title = findBuilding(buildingId)?.name ?? "Корпус";
  deleteCatalogBuilding(buildingId);
  note(actor, "BUILDING_DELETE", { objectId: owned.value.id, buildingId, targetType: "building", targetId: buildingId, target: `${owned.value.name} · ${title}` });
  return { ok: true, value: { id: buildingId } };
}

export function createUnit(
  actor: StaffActor,
  objectId: string,
  input: { name: unknown; buildingId: unknown },
): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId, "objects.structure.edit", "part");
  if (!owned.ok) return owned;
  const title = cleanText(input.name, "Введите название");
  if (typeof title !== "string") return title;
  const usesBuildings = objectPresentation[owned.value.type].usesBuildings;
  const buildingId = typeof input.buildingId === "string" ? input.buildingId : "";
  if (usesBuildings) {
    const building = findBuilding(buildingId);
    if (!building || building.objectId !== objectId) {
      return { ok: false, status: 400, message: "Сначала выберите корпус" };
    }
    if (!wholeObject(actor) && building.id !== actor.scope.buildingId) return denied;
  } else if (!wholeObject(actor)) {
    return denied;
  } else if (buildingId) {
    return { ok: false, status: 400, message: "У этого типа нет корпусов" };
  }
  const unit = createCatalogUnit({
    objectId,
    buildingId: usesBuildings ? buildingId : null,
    name: title,
    type: owned.value.type,
  });
  note(actor, "UNIT_CREATE", { objectId, buildingId: unit.buildingId, unitId: unit.id, targetType: "unit", targetId: unit.id, target: `${owned.value.name} · ${title}` });
  return { ok: true, value: { id: unit.id } };
}

function cleanArea(value: unknown): number | null | Failure {
  if (value === undefined || value === null || value === "") return null;
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 20_000) return { ok: false, status: 400, message: "Площадь: от 1 до 20 000 м²" };
  return Math.round(amount * 10) / 10;
}

function cleanFloors(value: unknown): number | Failure {
  const floors = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(floors) || floors < 1 || floors > 6) return { ok: false, status: 400, message: "Этажность: от 1 до 6" };
  return floors;
}

const planImage = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i;

function cleanPlans(value: unknown, floors: number): { floor: number; image: string }[] | Failure {
  if (!Array.isArray(value)) return [];
  const plans: { floor: number; image: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { floor?: unknown; image?: unknown };
    const floor = typeof row.floor === "number" ? row.floor : Number(row.floor);
    if (!Number.isInteger(floor) || floor < 1 || floor > floors) continue;
    if (typeof row.image !== "string" || !planImage.test(row.image) || row.image.length > 800_000) {
      return { ok: false, status: 400, message: "Планировка: изображение JPEG, PNG или WebP до 600 КБ" };
    }
    plans.push({ floor, image: row.image });
  }
  return plans;
}

export function unitDetails(actor: StaffActor, unitId: string): Success<{
  id: string;
  name: string;
  areaM2: number | null;
  floors: number;
  plans: { floor: number; image: string }[];
  rooms: { id: string; name: string; kind: string; floor: number | null }[];
}> | Failure {
  if (!can(actor, "objects.view")) return denied;
  const unit = unitFor(actor, unitId);
  if (!unit.ok) return unit;
  return {
    ok: true,
    value: {
      id: unit.value.id,
      name: unit.value.name,
      areaM2: unit.value.areaM2 ?? null,
      floors: unit.value.floors ?? 1,
      plans: (unit.value.plans ?? []).map((plan) => ({ floor: plan.floor, image: plan.image })),
      rooms: roomsOf(unitId).map((room) => ({ id: room.id, name: room.name, kind: room.kind, floor: room.floor })),
    },
  };
}

export function updateUnit(
  actor: StaffActor,
  unitId: string,
  input: { name?: unknown; areaM2?: unknown; floors?: unknown; plans?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.structure.edit")) return denied;
  const unit = unitFor(actor, unitId);
  if (!unit.ok) return unit;
  const title = cleanText(input.name, "Введите название");
  if (typeof title !== "string") return title;
  const area = input.areaM2 === undefined ? (unit.value.areaM2 ?? null) : cleanArea(input.areaM2);
  if (area && typeof area !== "number") return area;
  const areaM2 = typeof area === "number" ? area : null;
  const floors = input.floors === undefined ? (unit.value.floors ?? 1) : cleanFloors(input.floors);
  if (typeof floors !== "number") return floors;
  const plans = input.plans === undefined ? (unit.value.plans ?? []).filter((plan) => plan.floor <= floors) : cleanPlans(input.plans, floors);
  if (!Array.isArray(plans)) return plans;
  const changes = [
    ...(unit.value.name !== title ? [{ field: "Название", from: unit.value.name, to: title }] : []),
    ...((unit.value.areaM2 ?? null) !== areaM2
      ? [{ field: "Площадь", from: unit.value.areaM2 == null ? "" : String(unit.value.areaM2), to: areaM2 == null ? "" : String(areaM2) }]
      : []),
    ...((unit.value.floors ?? 1) !== floors ? [{ field: "Этажность", from: String(unit.value.floors ?? 1), to: String(floors) }] : []),
  ];
  updateCatalogUnit(unitId, { name: title, areaM2, floors, plans });
  if (changes.length || input.plans !== undefined) {
    note(actor, "UNIT_EDIT", {
      objectId: unit.value.objectId,
      buildingId: unit.value.buildingId,
      unitId,
      targetType: "unit",
      targetId: unitId,
      target: `${findObject(unit.value.objectId)?.name ?? "Объект"} · ${title}`,
      changes,
    });
  }
  return { ok: true, value: { id: unitId } };
}

export function removeUnit(actor: StaffActor, unitId: string): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.structure.edit")) return denied;
  const unit = unitFor(actor, unitId);
  if (!unit.ok) return unit;
  if (unitHasAssignment(unitId)) {
    return { ok: false, status: 409, message: "Эта единица уже закреплена за человеком." };
  }
  deleteCatalogUnit(unitId);
  note(actor, "UNIT_DELETE", {
    objectId: unit.value.objectId,
    buildingId: unit.value.buildingId,
    unitId,
    targetType: "unit",
    targetId: unitId,
    target: `${findObject(unit.value.objectId)?.name ?? "Объект"} · ${unit.value.name}`,
  });
  return { ok: true, value: { id: unitId } };
}

function locateBuilding(buildingId: string): { objectId: string } | undefined {
  const building = findBuilding(buildingId);
  return building ? { objectId: building.objectId } : undefined;
}
