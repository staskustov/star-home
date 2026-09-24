import { objectsOf, type CatalogObject } from "@/server/catalog-store";
import { adminMemberships, findMembership, isAdminRole } from "@/server/directory";
import type { Permission } from "@/server/rbac/permissions";
import { permissionsOf, type ScopeKind } from "@/server/rbac/policy";
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
      permissions: permissionsOf(membership.role),
    },
  };
}

export function can(actor: StaffActor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function objectsInScope(actor: StaffActor): CatalogObject[] {
  if (actor.scope.kind === "COMPANY" || actor.scope.kind === "PLATFORM") return objectsOf(actor.companyId, null);
  return actor.scope.objectId ? objectsOf(actor.companyId, actor.scope.objectId) : [];
}

export function withPermission(actor: Success<StaffActor> | Failure, permission: Permission): Success<StaffActor> | Failure {
  if (!actor.ok) return actor;
  if (!can(actor.value, permission)) return { ok: false, status: 403, message: "Нет доступа" };
  return actor;
}
