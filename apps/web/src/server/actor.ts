import { findMembership } from "@/server/directory";
import type { Permission } from "@/server/rbac/permissions";
import { householdCan } from "@/server/rbac/policy";
import type { Role } from "@/types/domain";

export type SessionRef = { userId: string; membershipId: string | null; sv?: number };

export type Place = {
  userId: string;
  companyId: string;
  objectId: string;
  unitId: string;
  role: Role;
};

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

function expired(expiresAt?: string | null): boolean {
  return Boolean(expiresAt) && Date.parse(expiresAt ?? "") <= Date.now();
}

export function placeFromSession(session: SessionRef | null, permission: Permission = "home.view"): Success<Place> | Failure {
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!membership || !householdCan(membership.role, "home.view") || !householdCan(membership.role, permission)) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  if (!membership.objectId || !membership.unitId || expired(membership.expiresAt)) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  return {
    ok: true,
    value: {
      userId: session.userId,
      companyId: membership.companyId,
      objectId: membership.objectId,
      unitId: membership.unitId,
      role: membership.role,
    },
  };
}
