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
  findUnit,
  readTree,
  unitIdsOf,
  unitIdsOfBuilding,
  updateCatalogObject,
} from "@/server/catalog-store";
import {
  adminMemberships,
  findMembership,
  isAdminRole,
  objectHasAssignments,
  unitHasAssignment,
} from "@/server/directory";
import { readSession } from "@/server/session";
import type { CatalogTree, CatalogUnitNode } from "@/types/catalog";
import { objectTypes, type ObjectType, type Role } from "@/types/domain";

type Actor = {
  companyId: string;
  role: Role;
  objectId: string | null;
};

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const companyRoles = new Set<Role>(["SUPER_ADMIN", "COMPANY_ADMIN"]);
const structureRoles = new Set<Role>(["SUPER_ADMIN", "COMPANY_ADMIN", "OBJECT_ADMIN", "MANAGER"]);

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

export async function catalogActor(): Promise<Success<Actor> | Failure> {
  const session = await readSession();
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const admins = adminMemberships(session.userId);
  const selected = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const membership = selected && isAdminRole(selected.role) ? selected : admins[0];
  if (!membership || !structureRoles.has(membership.role)) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  return {
    ok: true,
    value: { companyId: membership.companyId, role: membership.role, objectId: membership.objectId },
  };
}

function ownObject(actor: Actor, objectId: string): Success<NonNullable<ReturnType<typeof findObject>>> | Failure {
  const object = findObject(objectId);
  if (!object || object.companyId !== actor.companyId) {
    return { ok: false, status: 404, message: "Объект не найден" };
  }
  if (!companyRoles.has(actor.role) && actor.objectId !== object.id) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  return { ok: true, value: object };
}

function unitNode(unit: { id: string; name: string; number: string }): CatalogUnitNode {
  return { id: unit.id, name: unit.name, number: unit.number, canDelete: !unitHasAssignment(unit.id) };
}

export function treeFor(actor: Actor, objectId: string): CatalogTree | null {
  const owned = ownObject(actor, objectId);
  if (!owned.ok) return null;
  const tree = readTree(objectId);
  if (!tree) return null;
  return {
    object: {
      id: tree.object.id,
      name: tree.object.name,
      type: tree.object.type,
      address: tree.object.address,
      canDelete: companyRoles.has(actor.role) && !objectHasAssignments(objectId, unitIdsOf(objectId)),
    },
    buildings: tree.buildings
      ? tree.buildings.map((building) => ({
          id: building.id,
          name: building.name,
          number: building.number,
          units: building.units.map(unitNode),
        }))
      : null,
    units: tree.units ? tree.units.map(unitNode) : null,
  };
}

export function createObject(
  actor: Actor,
  input: { name: unknown; type: unknown; address: unknown },
): Success<{ id: string }> | Failure {
  if (!companyRoles.has(actor.role)) return { ok: false, status: 403, message: "Нет доступа" };
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
  actor: Actor,
  objectId: string,
  input: { name: unknown; address: unknown },
): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId);
  if (!owned.ok) return owned;
  const name = cleanText(input.name, "Введите название");
  if (typeof name !== "string") return name;
  const address = cleanAddress(input.address);
  if (typeof address !== "string") return address;
  updateCatalogObject(objectId, { name, address });
  return { ok: true, value: { id: objectId } };
}

export function removeObject(actor: Actor, objectId: string): Success<{ id: string }> | Failure {
  if (!companyRoles.has(actor.role)) return { ok: false, status: 403, message: "Нет доступа" };
  const owned = ownObject(actor, objectId);
  if (!owned.ok) return owned;
  if (objectHasAssignments(objectId, unitIdsOf(objectId))) {
    return { ok: false, status: 409, message: "Сначала уберите доступ людей к этому объекту." };
  }
  deleteCatalogObject(objectId);
  return { ok: true, value: { id: objectId } };
}

export function createBuilding(actor: Actor, objectId: string, name: unknown): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId);
  if (!owned.ok) return owned;
  if (!objectPresentation[owned.value.type].usesBuildings) {
    return { ok: false, status: 400, message: "У этого типа нет корпусов" };
  }
  const title = cleanText(name, "Введите название");
  if (typeof title !== "string") return title;
  const building = createCatalogBuilding(objectId, title);
  return { ok: true, value: { id: building.id } };
}

export function removeBuilding(actor: Actor, buildingId: string): Success<{ id: string }> | Failure {
  const building = locateBuilding(buildingId);
  if (!building) return { ok: false, status: 404, message: "Корпус не найден" };
  const owned = ownObject(actor, building.objectId);
  if (!owned.ok) return owned;
  if (unitIdsOfBuilding(buildingId).some((unitId) => unitHasAssignment(unitId))) {
    return { ok: false, status: 409, message: "В корпусе есть занятые единицы." };
  }
  deleteCatalogBuilding(buildingId);
  return { ok: true, value: { id: buildingId } };
}

export function createUnit(
  actor: Actor,
  objectId: string,
  input: { name: unknown; buildingId: unknown },
): Success<{ id: string }> | Failure {
  const owned = ownObject(actor, objectId);
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

export function removeUnit(actor: Actor, unitId: string): Success<{ id: string }> | Failure {
  const unit = findUnit(unitId);
  if (!unit) return { ok: false, status: 404, message: "Единица не найдена" };
  const owned = ownObject(actor, unit.objectId);
  if (!owned.ok) return owned;
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
