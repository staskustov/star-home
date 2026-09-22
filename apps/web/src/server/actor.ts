import { actorFromSession } from "@/server/catalog";
import { findObject } from "@/server/catalog-store";
import { findMembership } from "@/server/directory";
import type { Role } from "@/types/domain";

export type SessionRef = { userId: string; membershipId: string | null };

export type Place = {
  userId: string;
  companyId: string;
  objectId: string;
  unitId: string;
  role: Role;
};

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const companyRoles = new Set<Role>(["SUPER_ADMIN", "COMPANY_ADMIN"]);

const homeRoles = new Set<Role>(["RESIDENT", "FAMILY_MEMBER"]);

function expired(expiresAt?: string | null): boolean {
  return Boolean(expiresAt) && Date.parse(expiresAt ?? "") <= Date.now();
}

export function placeFromSession(session: SessionRef | null, roles: ReadonlySet<Role> = homeRoles): Success<Place> | Failure {
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!membership || !roles.has(membership.role) || !membership.objectId || !membership.unitId || expired(membership.expiresAt)) {
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

export async function residentPlace(): Promise<Success<Place> | Failure> {
  const { readSession } = await import("@/server/session");
  return placeFromSession(await readSession());
}

export function adminObjectFrom(session: SessionRef | null, objectId: string): Success<{ userId: string; companyId: string; objectId: string }> | Failure {
  const actor = actorFromSession(session);
  if (!actor.ok) return actor;
  const object = findObject(objectId);
  if (!object || object.companyId !== actor.value.companyId) {
    return { ok: false, status: 404, message: "Объект не найден" };
  }
  if (!companyRoles.has(actor.value.role) && actor.value.objectId !== object.id) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  return { ok: true, value: { userId: actor.value.userId, companyId: object.companyId, objectId: object.id } };
}

export async function adminObject(objectId: string): Promise<Success<{ userId: string; companyId: string; objectId: string }> | Failure> {
  const { readSession } = await import("@/server/session");
  return adminObjectFrom(await readSession(), objectId);
}
