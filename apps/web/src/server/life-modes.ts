import { findMembership } from "@/server/directory";
import {
  isLifeMode,
  knownChecks,
  modesForObject,
  setUnitMode,
  updateModeSetting,
} from "@/server/life-mode-store";
import { can, objectFor, objectsInScope, wholeObject, type StaffActor } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import type { LifeModeSetting } from "@/types/domain";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

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
  if (!membership || !householdCan(membership.role, "home.mode.switch") || !membership.unitId) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  if (!isLifeMode(mode)) return { ok: false, status: 400, message: "Неизвестный режим" };
  setUnitMode(membership.unitId, mode);
  return { ok: true, value: { mode } };
}

export function saveModeFor(
  actor: StaffActor,
  input: { objectId: unknown; setting: Partial<LifeModeSetting> | null },
): Success<{ mode: string }> | Failure {
  if (!can(actor, "settings.edit")) return { ok: false, status: 403, message: "Нет доступа" };
  const owned = objectFor(actor, input.objectId, "whole");
  if (!owned.ok) return owned;
  const object = owned.value;
  if (!input.setting || !isLifeMode(input.setting.mode)) return { ok: false, status: 400, message: "Выберите режим" };
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

export function settingsFor(actor: StaffActor) {
  return {
    canEdit: can(actor, "settings.edit") && wholeObject(actor),
    objects: objectsInScope(actor).map((object) => ({
      objectId: object.id,
      modes: modesForObject(object.id),
    })),
  };
}
