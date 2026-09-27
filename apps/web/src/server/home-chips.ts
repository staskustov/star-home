import { homeChipActions, homeChipIcons } from "@/lib/home-chips";
import { findObject } from "@/server/catalog-store";
import { findMembership } from "@/server/directory";
import { modesForObject } from "@/server/life-mode-store";
import { isOpener } from "@/server/device-kinds";
import { newId, readOps, writeOps, type HomeChip, type HomeChipKind } from "@/server/ops-store";
import { recordAudit } from "@/server/operations";
import { can, objectFor, type StaffActor } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import type { LifeMode } from "@/types/domain";

export { homeChipActions, homeChipIcons };

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

export type HomeChipView = {
  id: string;
  name: string;
  icon: (typeof homeChipIcons)[number];
  strip: "scenarios" | "actions";
  kind: HomeChipKind;
  lifeMode?: LifeMode;
  scenarioId?: string | null;
  action?: string | null;
  deviceId?: string | null;
  latch?: "OPEN" | "CLOSED";
  stale?: boolean;
  locked?: boolean;
};

const lifeModeIcons: Record<LifeMode, (typeof homeChipIcons)[number]> = {
  HOME: "house",
  WORK: "work",
  VACATION: "travel",
};

function denied(status = 403): Failure {
  return { ok: false, status, message: "Нет доступа" };
}

function asIcon(value: unknown): (typeof homeChipIcons)[number] | Failure {
  if (typeof value !== "string" || !(homeChipIcons as readonly string[]).includes(value)) {
    return { ok: false, status: 400, message: "Выберите иконку" };
  }
  return value as (typeof homeChipIcons)[number];
}

function asName(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите название" };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: "Введите название" };
  if (name.length > 24) return { ok: false, status: 400, message: "Слишком длинное название" };
  return name;
}

function asStrip(value: unknown): "scenarios" | "actions" | Failure {
  if (value === "scenarios" || value === "actions") return value;
  return { ok: false, status: 400, message: "Выберите блок" };
}

function asAction(value: unknown): (typeof homeChipActions)[number] | null | Failure {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !(homeChipActions as readonly string[]).includes(value)) {
    return { ok: false, status: 400, message: "Неизвестная кнопка" };
  }
  return value as (typeof homeChipActions)[number];
}

function asView(chip: HomeChip): HomeChipView {
  const icon = (homeChipIcons as readonly string[]).includes(chip.icon) ? (chip.icon as HomeChipView["icon"]) : "settings";
  return {
    id: chip.id,
    name: chip.name,
    icon,
    strip: chip.strip,
    kind: chip.kind,
    lifeMode: chip.lifeMode,
    scenarioId: chip.scenarioId ?? null,
    action: chip.action ?? null,
    deviceId: chip.deviceId ?? null,
    locked: Boolean(chip.locked),
  };
}

export function decorateActionChips(objectId: string, chips: HomeChipView[]): HomeChipView[] {
  const devices = readOps().devices.filter((device) => device.objectId === objectId);
  const openers = devices.filter((device) => isOpener(device.kind));
  return chips.map((chip) => {
    const bound = chip.deviceId ? openers.find((device) => device.id === chip.deviceId) : undefined;
    const byAction =
      chip.action === "open-gate"
        ? openers.find((device) => device.kind === "GATE")
        : chip.action === "open-point"
          ? openers.find((device) => device.kind === "WICKET" || device.kind === "BARRIER" || device.kind === "LOCK")
          : undefined;
    const device = bound ?? byAction;
    if (!device) return chip;
    return {
      ...chip,
      deviceId: device.id,
      latch: (device.state?.latch ?? device.latch) === "OPEN" ? "OPEN" : "CLOSED",
      stale: device.availability === "OFFLINE" || device.work === "FAULT" || device.work === "OFF",
    };
  });
}

function defaultsFor(objectId: string, companyId: string): HomeChip[] {
  const modes = modesForObject(objectId);
  const label = (mode: LifeMode, fallback: string) => modes.find((item) => item.mode === mode)?.label ?? fallback;
  return [
    { id: `chip_${objectId}_home`, companyId, objectId, name: label("HOME", "Дома"), icon: lifeModeIcons.HOME, kind: "LIFE_MODE", strip: "scenarios", lifeMode: "HOME", sort: 10, locked: true },
    { id: `chip_${objectId}_work`, companyId, objectId, name: label("WORK", "На работе"), icon: lifeModeIcons.WORK, kind: "LIFE_MODE", strip: "scenarios", lifeMode: "WORK", sort: 20, locked: true },
    { id: `chip_${objectId}_vacation`, companyId, objectId, name: label("VACATION", "В отпуске"), icon: lifeModeIcons.VACATION, kind: "LIFE_MODE", strip: "scenarios", lifeMode: "VACATION", sort: 30, locked: true },
    { id: `chip_${objectId}_night`, companyId, objectId, name: "Ночь", icon: "night", kind: "ACTION", strip: "scenarios", action: "night", sort: 40, locked: true },
    { id: `chip_${objectId}_gate`, companyId, objectId, name: "Ворота", icon: "gate", kind: "ACTION", strip: "actions", action: "open-gate", sort: 10, locked: true },
    { id: `chip_${objectId}_security`, companyId, objectId, name: "Охрана", icon: "security", kind: "ACTION", strip: "actions", action: "security", sort: 20, locked: true },
    { id: `chip_${objectId}_guests`, companyId, objectId, name: "Гости", icon: "guests", kind: "ACTION", strip: "actions", action: "guests", sort: 30, locked: true },
    ...readOps()
      .devices.filter((device) => device.objectId === objectId && device.unitId === null && isOpener(device.kind) && device.kind !== "GATE")
      .map((device, index) => ({
        id: `chip_${objectId}_${device.id}`,
        companyId,
        objectId,
        name: device.name,
        icon: device.kind === "LOCK" ? "lock" : "gate",
        kind: "ACTION" as const,
        strip: "actions" as const,
        action: "open-point" as const,
        deviceId: device.id,
        sort: 16 + index,
        locked: true,
      })),
  ];
}

export function ensureChipsFor(objectId: string, companyId: string): HomeChip[] {
  const existing = readOps().homeChips.filter((chip) => chip.objectId === objectId);
  const have = new Set(existing.map((chip) => chip.id));
  const extras = defaultsFor(objectId, companyId).filter((chip) => !have.has(chip.id));
  return [...existing, ...extras].sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name, "ru"));
}

function defaultIds(objectId: string, strip: "scenarios" | "actions"): string[] {
  return defaultsFor(objectId, "").filter((chip) => chip.strip === strip).map((chip) => chip.id);
}

function pickChips(objectId: string, companyId: string, ids: string[] | undefined, strip: "scenarios" | "actions"): HomeChipView[] {
  const chips = ensureChipsFor(objectId, companyId).filter((chip) => chip.strip === strip);
  const selected = ids ?? defaultIds(objectId, strip);
  const byId = new Map(chips.map((chip) => [chip.id, chip]));
  return selected.flatMap((id) => {
    const chip = byId.get(id);
    return chip ? [asView(chip)] : [];
  });
}

export function chipsForObject(objectId: string, companyId: string) {
  const chips = ensureChipsFor(objectId, companyId).map(asView);
  return {
    scenarios: chips.filter((chip) => chip.strip === "scenarios"),
    actions: chips.filter((chip) => chip.strip === "actions"),
  };
}

export function homeLayoutFor(userId: string, unitId: string, objectId: string, companyId: string) {
  const stored = readOps().homeLayouts.find((item) => item.userId === userId && item.unitId === unitId);
  const available = chipsForObject(objectId, companyId);
  return {
    scenarioIds: stored?.scenarioIds ?? defaultIds(objectId, "scenarios"),
    actionIds: stored?.actionIds ?? defaultIds(objectId, "actions"),
    scenarioChips: pickChips(objectId, companyId, stored?.scenarioIds, "scenarios"),
    actionChips: decorateActionChips(objectId, pickChips(objectId, companyId, stored?.actionIds, "actions")),
    available,
  };
}

export function saveHomeLayoutFor(
  session: { userId: string; membershipId: string | null } | null,
  input: { scenarioIds?: unknown; actionIds?: unknown },
): Success<{ scenarioIds: string[]; actionIds: string[] }> | Failure {
  if (!session) return { ok: false, status: 401, message: "Нужно войти" };
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!membership || !householdCan(membership.role, "home.view") || !membership.unitId || !membership.objectId) {
    return denied();
  }
  const object = findObject(membership.objectId);
  if (!object) return { ok: false, status: 404, message: "Объект не найден" };
  const chips = ensureChipsFor(object.id, object.companyId);
  const known = new Set(chips.map((chip) => chip.id));
  const clean = (value: unknown, strip: "scenarios" | "actions") => {
    if (!Array.isArray(value)) return defaultIds(object.id, strip);
    const ids = value.filter((item): item is string => typeof item === "string" && known.has(item) && chips.some((chip) => chip.id === item && chip.strip === strip));
    return [...new Set(ids)].slice(0, 20);
  };
  const scenarioIds = clean(input.scenarioIds, "scenarios");
  const actionIds = clean(input.actionIds, "actions");
  const file = readOps();
  const next = file.homeLayouts.filter((item) => !(item.userId === session.userId && item.unitId === membership.unitId));
  next.push({ userId: session.userId, unitId: membership.unitId, scenarioIds, actionIds });
  file.homeLayouts = next;
  writeOps(file);
  recordAudit({
    actorUserId: session.userId,
    companyId: membership.companyId,
    objectId: membership.objectId,
    unitId: membership.unitId,
    action: "HOME_LAYOUT",
    targetType: "home",
    targetId: membership.unitId,
    target: "Главный экран",
  });
  return { ok: true, value: { scenarioIds, actionIds } };
}

export function saveHomeChipFor(
  actor: StaffActor,
  input: {
    objectId?: unknown;
    chipId?: unknown;
    name?: unknown;
    icon?: unknown;
    strip?: unknown;
    scenarioId?: unknown;
    action?: unknown;
  },
): Success<HomeChipView> | Failure {
  if (!can(actor, "settings.edit")) return denied();
  const owned = objectFor(actor, input.objectId, "whole");
  if (!owned.ok) return owned;
  const object = owned.value;
  const name = asName(input.name);
  if (typeof name !== "string") return name;
  const icon = asIcon(input.icon);
  if (typeof icon !== "string") return icon;
  const strip = asStrip(input.strip);
  if (strip !== "scenarios" && strip !== "actions") return strip;
  const action = asAction(input.action);
  if (action && typeof action !== "string") return action;
  const scenarioId = typeof input.scenarioId === "string" && input.scenarioId.trim() ? input.scenarioId.trim() : null;
  if (scenarioId) {
    const scenario = readOps().scenarios.find((item) => item.id === scenarioId && item.objectId === object.id && item.companyId === object.companyId);
    if (!scenario) return { ok: false, status: 404, message: "Сценарий не найден" };
  }
  if (!scenarioId && !action) return { ok: false, status: 400, message: "Выберите сценарий или кнопку" };
  ensureChipsFor(object.id, object.companyId);
  const file = readOps();
  const chipId = typeof input.chipId === "string" ? input.chipId : "";
  const current = chipId ? file.homeChips.find((item) => item.id === chipId && item.objectId === object.id) : undefined;
  if (chipId && !current) return { ok: false, status: 404, message: "Плитка не найдена" };
  if (current?.locked) return { ok: false, status: 400, message: "Системную плитку нельзя изменить" };
  const kind: HomeChipKind = scenarioId ? "SCENARIO" : "ACTION";
  const next: HomeChip = {
    id: current?.id ?? newId("chip"),
    companyId: object.companyId,
    objectId: object.id,
    name,
    icon,
    kind,
    strip,
    scenarioId,
    action: scenarioId ? null : action,
    sort: current?.sort ?? (strip === "scenarios" ? 80 : 80) + file.homeChips.filter((item) => item.objectId === object.id && item.strip === strip).length,
    locked: false,
  };
  if (current) Object.assign(current, next);
  else file.homeChips.push(next);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: object.id,
    action: "HOME_CHIP",
    targetType: "home",
    targetId: next.id,
    target: next.name,
  });
  return { ok: true, value: asView(next) };
}

export function removeHomeChipFor(actor: StaffActor, input: { objectId?: unknown; chipId?: unknown }): Success<{ id: string }> | Failure {
  if (!can(actor, "settings.edit")) return denied();
  const owned = objectFor(actor, input.objectId, "whole");
  if (!owned.ok) return owned;
  const chipId = typeof input.chipId === "string" ? input.chipId : "";
  if (!chipId) return { ok: false, status: 400, message: "Плитка не найдена" };
  const file = readOps();
  const chip = file.homeChips.find((item) => item.id === chipId && item.objectId === owned.value.id);
  if (!chip) return { ok: false, status: 404, message: "Плитка не найдена" };
  if (chip.locked) return { ok: false, status: 400, message: "Системную плитку нельзя удалить" };
  file.homeChips = file.homeChips.filter((item) => item.id !== chip.id);
  file.homeLayouts = file.homeLayouts.map((layout) => ({
    ...layout,
    scenarioIds: layout.scenarioIds.filter((id) => id !== chip.id),
    actionIds: layout.actionIds.filter((id) => id !== chip.id),
  }));
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: owned.value.id,
    action: "HOME_CHIP",
    targetType: "home",
    targetId: chip.id,
    target: chip.name,
  });
  return { ok: true, value: { id: chip.id } };
}
