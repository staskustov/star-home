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
  unitIdsOf,
  unitIdsOfBuilding,
  updateCatalogObject,
} from "@/server/catalog-store";
import { buildingHasStaff, objectHasAssignments, unitHasAssignment } from "@/server/directory";
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

function ownObject(
  actor: StaffActor,
  objectId: string,
  permission: Permission,
  reach: "part" | "whole" = "whole",
): Success<NonNullable<ReturnType<typeof findObject>>> | Failure {
  if (!can(actor, permission)) return denied;
  return objectFor(actor, objectId, reach);
}

function unitNode(unit: { id: string; name: string; number: string }): CatalogUnitNode {
  return { id: unit.id, name: unit.name, number: unit.number, canDelete: !unitHasAssignment(unit.id) };
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
  updateCatalogObject(objectId, { name, address });
  return { ok: true, value: { id: objectId } };
}

export function removeObject(actor: StaffActor, objectId: string): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId, "objects.delete");
  if (!owned.ok) return owned;
  if (objectHasAssignments(objectId, unitIdsOf(objectId))) {
    return { ok: false, status: 409, message: "Сначала уберите доступ людей к этому объекту." };
  }
  deleteCatalogObject(objectId);
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
  return { ok: true, value: { id: building.id } };
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
  deleteCatalogBuilding(buildingId);
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
  return { ok: true, value: { id: unit.id } };
}

export function removeUnit(actor: StaffActor, unitId: string): Success<{ id: string }> | Failure {
  if (!can(actor, "objects.structure.edit")) return denied;
  const unit = unitFor(actor, unitId);
  if (!unit.ok) return unit;
  if (unitHasAssignment(unitId)) {
    return { ok: false, status: 409, message: "Эта единица уже закреплена за человеком." };
  }
  deleteCatalogUnit(unitId);
  return { ok: true, value: { id: unitId } };
}

function locateBuilding(buildingId: string): { objectId: string } | undefined {
  const building = findBuilding(buildingId);
  return building ? { objectId: building.objectId } : undefined;
}
