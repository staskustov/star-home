import { findMembership } from "@/server/directory";
import { recordAudit } from "@/server/operations";
import { readOps, writeOps, type HomeCoverRow } from "@/server/ops-store";
import { can, objectFor, staffActor } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import type { SessionRef } from "@/server/actor";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

export const defaultHomeCover = "/images/house-dusk.jpg";
const photoLimit = 550_000;

function denied(status = 403): Failure {
  return { ok: false, status, message: "Нет доступа" };
}

function asPhoto(value: unknown): string | null | Failure {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return { ok: false, status: 400, message: "Добавьте фото" };
  const photo = value.trim();
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo)) {
    return { ok: false, status: 400, message: "Нужен снимок JPEG, PNG или WebP" };
  }
  if (photo.length > photoLimit) return { ok: false, status: 400, message: "Слишком большой файл. Обрежьте фото." };
  return photo;
}

export function coverFor(objectId: string, unitId?: string | null): string {
  const rows = readOps().homeCovers.filter((item) => item.objectId === objectId);
  const unit = unitId ? rows.find((item) => item.unitId === unitId) : undefined;
  const object = rows.find((item) => item.unitId === null);
  return unit?.photo || object?.photo || defaultHomeCover;
}

export function saveHomeCoverFor(
  session: SessionRef | null,
  input: { photo?: unknown; objectId?: unknown; scope?: unknown },
): Success<{ photo: string | null }> | Failure {
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const photo = asPhoto(input.photo);
  if (photo && typeof photo !== "string") return photo;
  const objectScope = input.scope === "object";
  if (objectScope) {
    const actor = staffActor(session);
    if (!actor.ok) return actor;
    if (!can(actor.value, "settings.edit") && !can(actor.value, "objects.edit")) return denied();
    const owned = objectFor(actor.value, input.objectId, "whole");
    if (!owned.ok) return owned;
    writeCover({ objectId: owned.value.id, companyId: owned.value.companyId, unitId: null, photo });
    recordAudit({
      actorUserId: actor.value.userId,
      companyId: actor.value.companyId,
      objectId: owned.value.id,
      action: "HOME_COVER",
      targetType: "home",
      targetId: owned.value.id,
      target: "Фото объекта",
    });
    return { ok: true, value: { photo } };
  }
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!membership || !householdCan(membership.role, "home.view") || !membership.unitId || !membership.objectId) return denied();
  writeCover({ objectId: membership.objectId, companyId: membership.companyId, unitId: membership.unitId, photo });
  recordAudit({
    actorUserId: session.userId,
    companyId: membership.companyId,
    objectId: membership.objectId,
    unitId: membership.unitId,
    action: "HOME_COVER",
    targetType: "home",
    targetId: membership.unitId,
    target: "Фото дома",
  });
  return { ok: true, value: { photo } };
}

function writeCover(row: Omit<HomeCoverRow, "photo"> & { photo: string | null }) {
  const file = readOps();
  file.homeCovers = file.homeCovers.filter((item) => !(item.objectId === row.objectId && item.unitId === row.unitId));
  if (row.photo) file.homeCovers.push({ objectId: row.objectId, companyId: row.companyId, unitId: row.unitId, photo: row.photo });
  writeOps(file);
}
