import { findObject, objectsOf } from "@/server/catalog-store";
import { actorFromSession, catalogActor } from "@/server/catalog";
import { findMembership } from "@/server/directory";
import {
  isLifeMode,
  knownChecks,
  modesForObject,
  setUnitMode,
  updateModeSetting,
} from "@/server/life-mode-store";
import type { LifeModeSetting, Role } from "@/types/domain";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const companyRoles = new Set<Role>(["SUPER_ADMIN", "COMPANY_ADMIN"]);

async function currentSession() {
  const { readSession } = await import("@/server/session");
  return readSession();
}

function text(value: unknown, empty: string, limit = 160): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: empty };
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return { ok: false, status: 400, message: empty };
  if (cleaned.length > limit) return { ok: false, status: 400, message: "Слишком длинный текст" };
  return cleaned;
}

export function switchModeFor(session: { userId: string; membershipId: string | null } | null, mode: unknown): Success<{ mode: string }> | Failure {
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!membership || (membership.role !== "RESIDENT" && membership.role !== "FAMILY_MEMBER") || !membership.unitId) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  if (!isLifeMode(mode)) return { ok: false, status: 400, message: "Неизвестный режим" };
  setUnitMode(membership.unitId, mode);
  return { ok: true, value: { mode } };
}

export async function switchOwnMode(mode: unknown): Promise<Success<{ mode: string }> | Failure> {
  return switchModeFor(await currentSession(), mode);
}

export function saveModeFor(
  session: { userId: string; membershipId: string | null } | null,
  input: { objectId: unknown; setting: Partial<LifeModeSetting> | null },
): Success<{ mode: string }> | Failure {
  const actor = actorFromSession(session);
  if (!actor.ok) return actor;
  if (typeof input.objectId !== "string" || !input.setting || !isLifeMode(input.setting.mode)) {
    return { ok: false, status: 400, message: "Выберите режим" };
  }
  const object = findObject(input.objectId);
  if (!object || object.companyId !== actor.value.companyId) {
    return { ok: false, status: 404, message: "Объект не найден" };
  }
  if (!companyRoles.has(actor.value.role) && actor.value.objectId !== object.id) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  const current = modesForObject(object.id).find((mode) => mode.mode === input.setting?.mode);
  if (!current) return { ok: false, status: 400, message: "Выберите режим" };
  const label = text(input.setting.label, "Введите название", 24);
  if (typeof label !== "string") return label;
  const summary = text(input.setting.summary, "Введите статус");
  if (typeof summary !== "string") return summary;
  const detail = text(input.setting.detail, "Введите описание");
  if (typeof detail !== "string") return detail;
  const climate = text(input.setting.climate, "Введите климат");
  if (typeof climate !== "string") return climate;
  const lighting = text(input.setting.lighting, "Введите свет");
  if (typeof lighting !== "string") return lighting;
  const security = text(input.setting.security, "Введите охрану");
  if (typeof security !== "string") return security;
  const notifications = text(input.setting.notifications, "Введите уведомления");
  if (typeof notifications !== "string") return notifications;
  updateModeSetting(object.id, {
    ...current,
    label,
    summary,
    detail,
    climate,
    lighting,
    security,
    notifications,
    checks: knownChecks(input.setting.checks),
  });
  return { ok: true, value: { mode: current.mode } };
}

export async function saveModeSetting(
  input: { objectId: unknown; setting: Partial<LifeModeSetting> | null },
): Promise<Success<{ mode: string }> | Failure> {
  return saveModeFor(await currentSession(), input);
}

export function settingsFor(actor: { companyId: string; role: Role; objectId: string | null }) {
  const limit = companyRoles.has(actor.role) ? null : actor.objectId;
  return objectsOf(actor.companyId, limit).map((object) => ({
    objectId: object.id,
    modes: modesForObject(object.id),
  }));
}

export async function settingsBoard(): Promise<{ objectId: string; modes: LifeModeSetting[] }[] | null> {
  const actor = await catalogActor();
  if (!actor.ok) return null;
  return settingsFor(actor.value);
}
