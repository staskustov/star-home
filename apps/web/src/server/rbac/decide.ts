import { companyGrants, findObject, objectsOf, type CatalogObject } from "@/server/catalog-store";
import { adminMemberships, findMembership, isAdminRole } from "@/server/directory";
import { isPermission, type Permission } from "@/server/rbac/permissions";
import { lockedOf, permissionsOf, type ScopeKind } from "@/server/rbac/policy";
import type { Membership, Role } from "@/types/domain";

export type StaffActor = {
  userId: string;
  membershipId: string;
  role: Role;
  companyId: string;
  scope: { kind: ScopeKind; objectId: string | null };
  permissions: ReadonlySet<Permission>;
};

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

function expired(membership: Membership): boolean {
  return Boolean(membership.expiresAt) && Date.parse(membership.expiresAt ?? "") <= Date.now();
}

function scopeOf(membership: Membership): StaffActor["scope"] {
  if (membership.unitId) return { kind: "UNIT", objectId: membership.objectId };
  if (membership.objectId) return { kind: "OBJECT", objectId: membership.objectId };
  return { kind: "COMPANY", objectId: null };
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
  return {
    ok: true,
    value: {
      userId: session.userId,
      membershipId: membership.id,
      role: membership.role,
      companyId: membership.companyId,
      scope: scopeOf(membership),
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

export function objectFor(actor: StaffActor, objectId: unknown): Success<CatalogObject> | Failure {
  if (typeof objectId !== "string" || !objectId) return { ok: false, status: 400, message: "Выберите объект" };
  const object = findObject(objectId);
  if (!object || object.companyId !== actor.companyId) return { ok: false, status: 404, message: "Объект не найден" };
  if (!inScope(actor, object.id)) return { ok: false, status: 403, message: "Нет доступа" };
  return { ok: true, value: object };
}

export function withPermission(actor: Success<StaffActor> | Failure, permission: Permission): Success<StaffActor> | Failure {
  if (!actor.ok) return actor;
  if (!can(actor.value, permission)) return { ok: false, status: 403, message: "Нет доступа" };
  return actor;
}
