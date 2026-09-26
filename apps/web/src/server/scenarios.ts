import type { SessionRef } from "@/server/actor";
import { findObject } from "@/server/catalog-store";
import { commandDeviceSmart, smartViewer, viewerReaches } from "@/server/smart-home";
import { recordAudit } from "@/server/operations";
import { timeZone } from "@/server/time-zone";
import { findDevice, newId, readOps, writeOps, type Scenario, type ScenarioCondition, type ScenarioStep, type ScenarioTrigger } from "@/server/ops-store";
import { can } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import { commandRisk, isSmartCommand } from "@/server/smart-commands";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

function denied(status = 403): Failure {
  return { ok: false, status, message: "Нет доступа" };
}

function viewerCanEdit(viewer: { kind: "staff"; actor: { userId: string } } | { kind: "home"; place: { userId: string; role: "RESIDENT" | "FAMILY_MEMBER" | "GUEST" | "SUPER_ADMIN" | "COMPANY_ADMIN" | "OBJECT_ADMIN" | "MANAGER" | "SECURITY" | "SERVICE_OPERATOR" | "ACCOUNTANT" } }): boolean {
  return viewer.kind === "staff" ? can(viewer.actor as never, "devices.edit") : householdCan(viewer.place.role, "devices.command");
}

function actorUser(viewer: { kind: "staff"; actor: { userId: string } } | { kind: "home"; place: { userId: string } }): string {
  return viewer.kind === "staff" ? viewer.actor.userId : viewer.place.userId;
}

function cleanName(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите название" };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: "Введите название" };
  if (name.length > 80) return { ok: false, status: 400, message: "Слишком длинное название" };
  return name;
}

function cleanSteps(value: unknown, companyId: string, objectId: string): ScenarioStep[] | Failure {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, status: 400, message: "Добавьте шаги сценария" };
  if (value.length > 20) return { ok: false, status: 400, message: "Слишком много шагов" };
  const steps: ScenarioStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { ok: false, status: 400, message: "Проверьте шаг сценария" };
    const row = item as { deviceId?: unknown; command?: unknown; value?: unknown };
    if (typeof row.deviceId !== "string" || !row.deviceId) return { ok: false, status: 400, message: "Устройство не найдено" };
    if (!isSmartCommand(row.command)) return { ok: false, status: 400, message: "Неизвестная команда" };
    const device = findDevice(row.deviceId);
    if (!device || device.companyId !== companyId || device.objectId !== objectId) return { ok: false, status: 404, message: "Устройство не найдено" };
    steps.push({ deviceId: device.id, command: row.command, value: row.value });
  }
  return steps;
}

function asPublic(scenario: Scenario) {
  return {
    id: scenario.id,
    objectId: scenario.objectId,
    unitId: scenario.unitId,
    name: scenario.name,
    trigger: scenario.trigger,
    lifeMode: scenario.lifeMode ?? null,
    enabled: scenario.enabled !== false,
    conditions: scenario.conditions ?? [],
    scheduleHour: scenario.scheduleHour ?? null,
    scheduleMinute: scenario.scheduleMinute ?? null,
    steps: scenario.steps,
  };
}

function scopedScenario(session: SessionRef | null, scenarioId: unknown): Result<Scenario> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (typeof scenarioId !== "string" || !scenarioId) return { ok: false, status: 400, message: "Сценарий не найден" };
  const scenario = readOps().scenarios.find((item) => item.id === scenarioId);
  if (!scenario || scenario.companyId !== (viewer.value.kind === "staff" ? viewer.value.actor.companyId : viewer.value.place.companyId)) {
    return { ok: false, status: 404, message: "Сценарий не найден" };
  }
  if (!viewerReaches(viewer.value, scenario)) return denied();
  return { ok: true, value: scenario };
}

export function listScenarios(session: SessionRef | null, objectId?: unknown): Result<{ scenarios: ReturnType<typeof asPublic>[] }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  return {
    ok: true,
    value: {
      scenarios: readOps()
        .scenarios.filter((scenario) => viewerReaches(viewer.value, scenario) && (typeof objectId !== "string" || !objectId || scenario.objectId === objectId))
        .map(asPublic),
    },
  };
}

export function createScenario(
  session: SessionRef | null,
  input: {
    objectId?: unknown;
    unitId?: unknown;
    name?: unknown;
    trigger?: unknown;
    lifeMode?: unknown;
    steps?: unknown;
    conditions?: unknown;
    scheduleHour?: unknown;
    scheduleMinute?: unknown;
  },
): Result<{ id: string }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (!viewerCanEdit(viewer.value)) return denied();
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const companyId = viewer.value.kind === "staff" ? viewer.value.actor.companyId : viewer.value.place.companyId;
  const objectId = viewer.value.kind === "home" ? viewer.value.place.objectId : typeof input.objectId === "string" ? input.objectId : "";
  if (!objectId) return { ok: false, status: 400, message: "Выберите объект" };
  const catalog = findObject(objectId);
  if (!catalog || catalog.companyId !== companyId) return { ok: false, status: 404, message: "Объект не найден" };
  if (!viewerReaches(viewer.value, { companyId, objectId, unitId: typeof input.unitId === "string" ? input.unitId : null })) return denied();
  const steps = cleanSteps(input.steps, companyId, objectId);
  if (!Array.isArray(steps)) return steps;
  const trigger = asTrigger(input.trigger);
  const lifeMode = input.lifeMode === "HOME" || input.lifeMode === "WORK" || input.lifeMode === "VACATION" ? input.lifeMode : undefined;
  if (trigger === "LIFE_MODE" && !lifeMode) return { ok: false, status: 400, message: "Выберите режим" };
  const conditions = cleanConditions(input.conditions, companyId, objectId);
  if (!Array.isArray(conditions)) return conditions;
  const schedule = cleanSchedule(trigger, input.scheduleHour, input.scheduleMinute);
  if (!schedule.ok) return schedule;
  const scenario: Scenario = {
    id: newId("scen"),
    companyId,
    objectId,
    unitId: viewer.value.kind === "home" ? viewer.value.place.unitId : typeof input.unitId === "string" ? input.unitId : null,
    name,
    trigger,
    lifeMode,
    enabled: true,
    conditions,
    scheduleHour: schedule.value.hour,
    scheduleMinute: schedule.value.minute,
    steps,
  };
  const file = readOps();
  file.scenarios.unshift(scenario);
  writeOps(file);
  recordAudit({
    actorUserId: actorUser(viewer.value),
    companyId,
    objectId,
    unitId: scenario.unitId,
    action: "SCENARIO_CREATE",
    targetType: "scenario",
    targetId: scenario.id,
    target: scenario.name,
  });
  return { ok: true, value: { id: scenario.id } };
}

export function updateScenario(
  session: SessionRef | null,
  input: {
    scenarioId?: unknown;
    name?: unknown;
    trigger?: unknown;
    lifeMode?: unknown;
    steps?: unknown;
    conditions?: unknown;
    scheduleHour?: unknown;
    scheduleMinute?: unknown;
    enabled?: unknown;
  },
): Result<{ id: string }> {
  const found = scopedScenario(session, input.scenarioId);
  if (!found.ok) return found;
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (!viewerCanEdit(viewer.value)) return denied();
  const file = readOps();
  const current = file.scenarios.find((item) => item.id === found.value.id);
  if (!current) return { ok: false, status: 404, message: "Сценарий не найден" };
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (typeof name !== "string") return name;
    current.name = name;
  }
  if (input.trigger === "LIFE_MODE" || input.trigger === "MANUAL" || input.trigger === "EVENT" || input.trigger === "SCHEDULE") {
    current.trigger = input.trigger;
  }
  if (input.lifeMode === "HOME" || input.lifeMode === "WORK" || input.lifeMode === "VACATION" || input.lifeMode === null) {
    current.lifeMode = input.lifeMode ?? undefined;
  }
  if (input.enabled === true || input.enabled === false) current.enabled = input.enabled;
  if (input.conditions !== undefined) {
    const conditions = cleanConditions(input.conditions, current.companyId, current.objectId);
    if (!Array.isArray(conditions)) return conditions;
    current.conditions = conditions;
  }
  if (input.scheduleHour !== undefined || input.scheduleMinute !== undefined) {
    const schedule = cleanSchedule(current.trigger, input.scheduleHour ?? current.scheduleHour, input.scheduleMinute ?? current.scheduleMinute);
    if (!schedule.ok) return schedule;
    current.scheduleHour = schedule.value.hour;
    current.scheduleMinute = schedule.value.minute;
  }
  if (input.steps !== undefined) {
    const steps = cleanSteps(input.steps, current.companyId, current.objectId);
    if (!Array.isArray(steps)) return steps;
    current.steps = steps;
  }
  writeOps(file);
  recordAudit({
    actorUserId: actorUser(viewer.value),
    companyId: current.companyId,
    objectId: current.objectId,
    unitId: current.unitId,
    action: "SCENARIO_EDIT",
    targetType: "scenario",
    targetId: current.id,
    target: current.name,
  });
  return { ok: true, value: { id: current.id } };
}

export function removeScenario(session: SessionRef | null, scenarioId: unknown): Result<{ id: string }> {
  const found = scopedScenario(session, scenarioId);
  if (!found.ok) return found;
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (!viewerCanEdit(viewer.value)) return denied();
  const file = readOps();
  file.scenarios = file.scenarios.filter((item) => item.id !== found.value.id);
  writeOps(file);
  recordAudit({
    actorUserId: actorUser(viewer.value),
    companyId: found.value.companyId,
    objectId: found.value.objectId,
    unitId: found.value.unitId,
    action: "SCENARIO_DELETE",
    targetType: "scenario",
    targetId: found.value.id,
    target: found.value.name,
  });
  return { ok: true, value: { id: found.value.id } };
}

export async function runScenario(
  session: SessionRef | null,
  input: { scenarioId?: unknown; confirmToken?: unknown },
  options?: { skipHigh?: boolean },
): Promise<Result<{ confirmed: boolean; needsConfirm?: boolean; token?: string; message: string; ran: number }>> {
  const found = scopedScenario(session, input.scenarioId);
  if (!found.ok) return found;
  const scenario = found.value;
  const steps = options?.skipHigh
    ? scenario.steps.filter((step) => {
        const device = findDevice(step.deviceId);
        return device && isSmartCommand(step.command) && commandRisk(step.command, device) !== "HIGH";
      })
    : scenario.steps;
  let ran = 0;
  for (const step of steps) {
    const result = await commandDeviceSmart(session, {
      deviceId: step.deviceId,
      command: step.command,
      value: step.value,
      confirmToken: input.confirmToken,
      source: "scenario",
    });
    if (!result.ok) return result;
    if (result.value.needsConfirm) return { ok: true, value: { confirmed: false, needsConfirm: true, token: result.value.token, message: result.value.message, ran } };
    if (!result.value.confirmed) return { ok: true, value: { confirmed: false, message: result.value.message, ran } };
    ran += 1;
  }
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  recordAudit({
    actorUserId: actorUser(viewer.value),
    companyId: scenario.companyId,
    objectId: scenario.objectId,
    unitId: scenario.unitId,
    action: "SCENARIO_RUN",
    targetType: "scenario",
    targetId: scenario.id,
    target: scenario.name,
  });
  return { ok: true, value: { confirmed: true, message: ran ? "Сценарий выполнен." : "Нет безопасных шагов.", ran } };
}

function asTrigger(value: unknown): ScenarioTrigger {
  if (value === "LIFE_MODE" || value === "EVENT" || value === "SCHEDULE") return value;
  return "MANUAL";
}

function cleanConditions(value: unknown, companyId: string, objectId: string): ScenarioCondition[] | Failure {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return { ok: false, status: 400, message: "Проверьте условия" };
  if (value.length > 8) return { ok: false, status: 400, message: "Слишком много условий" };
  const rows: ScenarioCondition[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { ok: false, status: 400, message: "Проверьте условие" };
    const row = item as { deviceId?: unknown; field?: unknown; value?: unknown };
    if (typeof row.deviceId !== "string" || !row.deviceId) return { ok: false, status: 400, message: "Устройство не найдено" };
    if (row.field !== "on" && row.field !== "latch" && row.field !== "detected" && row.field !== "brightness") {
      return { ok: false, status: 400, message: "Неизвестное условие" };
    }
    const device = findDevice(row.deviceId);
    if (!device || device.companyId !== companyId || device.objectId !== objectId) return { ok: false, status: 404, message: "Устройство не найдено" };
    rows.push({ deviceId: device.id, field: row.field, op: "eq", value: row.value });
  }
  return rows;
}

function cleanSchedule(
  trigger: ScenarioTrigger,
  hour: unknown,
  minute: unknown,
): Result<{ hour?: number; minute?: number }> {
  if (trigger !== "SCHEDULE") return { ok: true, value: {} };
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) {
    return { ok: false, status: 400, message: "Укажите время" };
  }
  return { ok: true, value: { hour: h, minute: m } };
}

function conditionMet(condition: ScenarioCondition): boolean {
  const device = findDevice(condition.deviceId);
  if (!device) return false;
  const state = device.state ?? {};
  if (condition.field === "on") return state.on === condition.value;
  if (condition.field === "latch") return (state.latch ?? device.latch) === condition.value;
  if (condition.field === "detected") return state.detected === condition.value;
  if (condition.field === "brightness") return state.brightness === condition.value;
  return false;
}

export async function runEventScenarios(session: SessionRef | null, deviceId: string): Promise<void> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return;
  const rows = readOps().scenarios.filter(
    (scenario) =>
      scenario.trigger === "EVENT" &&
      scenario.enabled !== false &&
      viewerReaches(viewer.value, scenario) &&
      (scenario.conditions ?? []).some((item) => item.deviceId === deviceId) &&
      (scenario.conditions ?? []).every(conditionMet),
  );
  for (const scenario of rows) {
    await runScenario(session, { scenarioId: scenario.id }, { skipHigh: true });
  }
}

export async function runDueSchedules(session: SessionRef | null): Promise<void> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
  const minute = Number(new Intl.DateTimeFormat("en-GB", { minute: "2-digit", timeZone }).format(now));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const file = readOps();
  const due = file.scenarios.filter(
    (scenario) =>
      scenario.trigger === "SCHEDULE" &&
      scenario.enabled !== false &&
      scenario.scheduleHour === hour &&
      scenario.scheduleMinute === minute &&
      scenario.lastRunAt !== today &&
      viewerReaches(viewer.value, scenario),
  );
  for (const scenario of due) {
    const current = file.scenarios.find((item) => item.id === scenario.id);
    if (current) current.lastRunAt = today;
    writeOps(file);
    await runScenario(session, { scenarioId: scenario.id }, { skipHigh: true });
  }
}

export async function runLifeModeScenarios(session: SessionRef | null, unitId: string, mode: "HOME" | "WORK" | "VACATION"): Promise<void> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return;
  const rows = readOps().scenarios.filter(
    (scenario) => scenario.trigger === "LIFE_MODE" && scenario.lifeMode === mode && viewerReaches(viewer.value, scenario) && (scenario.unitId === unitId || scenario.unitId === null),
  );
  for (const scenario of rows) {
    await runScenario(session, { scenarioId: scenario.id }, { skipHigh: true });
  }
}
