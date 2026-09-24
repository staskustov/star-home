import { companyGrants, findBuilding, findObject, findUnit, objectsOf, type CatalogObject, type CatalogUnit } from "@/server/catalog-store";
import { adminMemberships, findMembership, isAdminRole } from "@/server/directory";
import { isPermission, type Permission } from "@/server/rbac/permissions";
import { lockedOf, permissionsOf, type ScopeKind } from "@/server/rbac/policy";
import type { Membership, Role } from "@/types/domain";

export type StaffActor = {
  userId: string;
  membershipId: string;
  role: Role;
  companyId: string;
  scope: { kind: ScopeKind; objectId: string | null; buildingId: string | null };
  permissions: ReadonlySet<Permission>;
};

export type Scoped = { companyId: string; objectId: string; unitId?: string | null };

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

function expired(membership: Membership): boolean {
  return Boolean(membership.expiresAt) && Date.parse(membership.expiresAt ?? "") <= Date.now();
}

function scopeOf(membership: Membership): StaffActor["scope"] | null {
  if (membership.unitId) return { kind: "UNIT", objectId: membership.objectId, buildingId: null };
  if (membership.objectId && membership.buildingId) {
    if (findBuilding(membership.buildingId)?.objectId !== membership.objectId) return null;
    return { kind: "BUILDING", objectId: membership.objectId, buildingId: membership.buildingId };
  }
  if (membership.objectId) return { kind: "OBJECT", objectId: membership.objectId, buildingId: null };
  return { kind: "COMPANY", objectId: null, buildingId: null };
}

export function grantedTo(role: Role, companyId: string): ReadonlySet<Permission> {
  const ceiling = permissionsOf(role);
  const chosen = companyGrants(companyId, role);
  if (!chosen) return ceiling;
  const granted = new Set<Permission>(lockedOf(role));
  for (const permission of chosen) if (isPermission(permission) && ceiling.has(permission)) granted.add(permission);
  return granted;
}

export function staffActor(session: { userId: string; membershipId: string | null } | null): Success<StaffActor> | Failure {
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const selected = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const membership = selected && isAdminRole(selected.role) ? selected : adminMemberships(session.userId)[0];
  if (!membership || expired(membership)) return { ok: false, status: 403, message: "Нет доступа" };
  const scope = scopeOf(membership);
  if (!scope) return { ok: false, status: 403, message: "Нет доступа" };
  return {
    ok: true,
    value: {
      userId: session.userId,
      membershipId: membership.id,
      role: membership.role,
      companyId: membership.companyId,
      scope,
      permissions: grantedTo(membership.role, membership.companyId),
    },
  };
}

export function can(actor: StaffActor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function companyWide(actor: StaffActor): boolean {
  return actor.scope.kind === "COMPANY" || actor.scope.kind === "PLATFORM";
}

export function objectsInScope(actor: StaffActor): CatalogObject[] {
  if (companyWide(actor)) return objectsOf(actor.companyId, null);
  return actor.scope.objectId ? objectsOf(actor.companyId, actor.scope.objectId) : [];
}

export function inScope(actor: StaffActor, objectId: string | null | undefined): boolean {
  if (!objectId) return false;
  return objectsInScope(actor).some((object) => object.id === objectId);
}

export function wholeObject(actor: StaffActor): boolean {
  return actor.scope.kind !== "BUILDING" && actor.scope.kind !== "UNIT";
}

export function unitInScope(actor: StaffActor, unit: CatalogUnit): boolean {
  if (!inScope(actor, unit.objectId)) return false;
  return actor.scope.kind !== "BUILDING" || unit.buildingId === actor.scope.buildingId;
}

export function reaches(actor: StaffActor, row: Scoped): boolean {
  if (row.companyId !== actor.companyId || !inScope(actor, row.objectId)) return false;
  if (actor.scope.kind !== "BUILDING") return true;
  if (row.unitId === null) return true;
  if (!row.unitId) return false;
  const unit = findUnit(row.unitId);
  return Boolean(unit) && unit?.objectId === row.objectId && unit?.buildingId === actor.scope.buildingId;
}

export function objectFor(actor: StaffActor, objectId: unknown, reach: "part" | "whole" = "part"): Success<CatalogObject> | Failure {
  if (typeof objectId !== "string" || !objectId) return { ok: false, status: 400, message: "Выберите объект" };
  const object = findObject(objectId);
  if (!object || object.companyId !== actor.companyId) return { ok: false, status: 404, message: "Объект не найден" };
  if (!inScope(actor, object.id)) return { ok: false, status: 403, message: "Нет доступа" };
  if (reach === "whole" && !wholeObject(actor)) return { ok: false, status: 403, message: "Нужен доступ ко всему объекту" };
  return { ok: true, value: object };
}

export function unitFor(actor: StaffActor, unitId: unknown): Success<CatalogUnit> | Failure {
  if (typeof unitId !== "string" || !unitId) return { ok: false, status: 400, message: "Выберите единицу" };
  const unit = findUnit(unitId);
  const object = unit ? findObject(unit.objectId) : undefined;
  if (!unit || !object || object.companyId !== actor.companyId) return { ok: false, status: 404, message: "Единица не найдена" };
  if (!unitInScope(actor, unit)) return { ok: false, status: 403, message: "Нет доступа" };
  return { ok: true, value: unit };
}

export function withPermission(actor: Success<StaffActor> | Failure, permission: Permission): Success<StaffActor> | Failure {
  if (!actor.ok) return actor;
  if (!can(actor.value, permission)) return { ok: false, status: 403, message: "Нет доступа" };
  return actor;
}
