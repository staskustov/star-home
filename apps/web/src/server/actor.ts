import { catalogActor } from "@/server/catalog";
import { findObject } from "@/server/catalog-store";
import { findMembership } from "@/server/directory";
import { readSession } from "@/server/session";
import type { Role } from "@/types/domain";

export type Place = {
  userId: string;
  companyId: string;
  objectId: string;
  unitId: string;
};

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const companyRoles = new Set<Role>(["SUPER_ADMIN", "COMPANY_ADMIN"]);

export async function residentPlace(): Promise<Success<Place> | Failure> {
  const session = await readSession();
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!membership || membership.role !== "RESIDENT" || !membership.objectId || !membership.unitId) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  return {
    ok: true,
    value: {
      userId: session.userId,
      companyId: membership.companyId,
      objectId: membership.objectId,
      unitId: membership.unitId,
    },
  };
}

export async function adminObject(objectId: string): Promise<Success<{ userId: string; companyId: string; objectId: string }> | Failure> {
  const actor = await catalogActor();
  if (!actor.ok) return actor;
  const object = findObject(objectId);
  if (!object || object.companyId !== actor.value.companyId) {
    return { ok: false, status: 404, message: "Объект не найден" };
  }
  if (!companyRoles.has(actor.value.role) && actor.value.objectId !== object.id) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  const session = await readSession();
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  return { ok: true, value: { userId: session.userId, companyId: object.companyId, objectId: object.id } };
}
