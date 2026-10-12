import type { SessionRef } from "@/server/actor";
import { enqueueScenarioOnGateway, inferScenarioRuntime, scenarioExecutes, scenarioRuntime, type ScenarioRuntime } from "@/server/automation";
import { findObject } from "@/server/catalog-store";
import { residentSeesDevice } from "@/server/device-kinds";
import { askConfirm, checkStep, commandDeviceSmart, smartViewer, takeConfirm, viewerCommands, viewerReaches, type Viewer } from "@/server/smart-home";
import { recordAudit } from "@/server/operations";
import { dispatchPhysicalCommand } from "@/server/physical-command";
import { timeZone } from "@/server/time-zone";
import { findDevice, newId, projectCamerasOpen, readOps, writeOps, type Device, type Scenario, type ScenarioCondition, type ScenarioStep, type ScenarioTrigger } from "@/server/ops-store";
import { can } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import { commandRisk, isSmartCommand } from "@/server/smart-commands";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

function denied(status = 403): Failure {
  return { ok: false, status, message: "Нет доступа" };
}

function viewerCanEdit(viewer: Viewer): boolean {
  return viewer.kind === "staff" ? can(viewer.actor, "devices.edit") : householdCan(viewer.place.role, "devices.command");
}

function viewerOwns(viewer: Viewer, scenario: Scenario): boolean {
  if (viewer.kind === "staff") return true;
  return scenario.unitId !== null && scenario.unitId === viewer.place.unitId;
}

function actorUser(viewer: Viewer): string {
  return viewer.kind === "staff" ? viewer.actor.userId : viewer.place.userId;
}

function cleanName(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите название" };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: "Введите название" };
  if (name.length > 80) return { ok: false, status: 400, message: "Слишком длинное название" };
  return name;
}

function viewerDevice(viewer: Viewer, deviceId: string, companyId: string, objectId: string, unitId: string | null): Device | null {
  const device = findDevice(deviceId);
  if (!device || device.companyId !== companyId || device.objectId !== objectId) return null;
  if (!viewerReaches(viewer, device)) return null;
  if (unitId && device.unitId && device.unitId !== unitId) return null;
  if (viewer.kind === "home" && !residentSeesDevice(device, { projectCameras: projectCamerasOpen(device.objectId) })) return null;
  return device;
}

function cleanSteps(value: unknown, companyId: string, objectId: string, unitId: string | null, viewer: Viewer): ScenarioStep[] | Failure {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, status: 400, message: "Добавьте шаги сценария" };
  if (value.length > 20) return { ok: false, status: 400, message: "Слишком много шагов" };
  const steps: ScenarioStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { ok: false, status: 400, message: "Проверьте шаг сценария" };
    const row = item as { deviceId?: unknown; command?: unknown; value?: unknown };
    if (typeof row.deviceId !== "string" || !row.deviceId) return { ok: false, status: 400, message: "Устройство не найдено" };
    if (!isSmartCommand(row.command)) return { ok: false, status: 400, message: "Неизвестная команда" };
    const device = viewerDevice(viewer, row.deviceId, companyId, objectId, unitId);
    if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
    const check = checkStep(viewer, device.id, row.command);
    if (!check.ok) return check;
    steps.push({ deviceId: device.id, command: row.command, value: row.value });
  }
  return steps;
}

function asPublic(scenario: Scenario) {
  const runtime = scenarioRuntime(scenario);
  const executes = scenarioExecutes(scenario);
  return {
    id: scenario.id,
    objectId: scenario.objectId,
    unitId: scenario.unitId,
    name: scenario.name,
    description: scenario.description ?? "",
    trigger: scenario.trigger,
    lifeMode: scenario.lifeMode ?? null,
    enabled: scenario.enabled !== false,
    conditions: scenario.conditions ?? [],
    scheduleHour: scenario.scheduleHour ?? null,
    scheduleMinute: scenario.scheduleMinute ?? null,
    steps: scenario.steps,
    runtime,
    executes,
  };
}

function scopedScenario(session: SessionRef | null, scenarioId: unknown): Result<{ scenario: Scenario; viewer: Viewer }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (typeof scenarioId !== "string" || !scenarioId) return { ok: false, status: 400, message: "Сценарий не найден" };
  const scenario = readOps().scenarios.find((item) => item.id === scenarioId);
  if (!scenario || scenario.companyId !== (viewer.value.kind === "staff" ? viewer.value.actor.companyId : viewer.value.place.companyId)) {
    return { ok: false, status: 404, message: "Сценарий не найден" };
  }
  if (!viewerReaches(viewer.value, scenario)) return denied();
  return { ok: true, value: { scenario, viewer: viewer.value } };
}

function pickRuntime(trigger: ScenarioTrigger, requested: unknown, involved: Device[]): ScenarioRuntime {
  if (trigger !== "EVENT" && trigger !== "SCHEDULE") return "cloud";
  if (requested === "cloud") return "cloud";
  if (requested === "gateway") return "gateway";
  return inferScenarioRuntime(trigger, involved);
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
    description?: unknown;
    trigger?: unknown;
    lifeMode?: unknown;
    steps?: unknown;
    conditions?: unknown;
    scheduleHour?: unknown;
    scheduleMinute?: unknown;
    runtime?: unknown;
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
  const unitId = viewer.value.kind === "home" ? viewer.value.place.unitId || null : typeof input.unitId === "string" && input.unitId ? input.unitId : null;
  if (viewer.value.kind === "home" && !unitId) return denied();
  if (!viewerReaches(viewer.value, { companyId, objectId, unitId })) return denied();
  const steps = cleanSteps(input.steps, companyId, objectId, unitId, viewer.value);
  if (!Array.isArray(steps)) return steps;
  const trigger = asTrigger(input.trigger);
  const lifeMode = input.lifeMode === "HOME" || input.lifeMode === "WORK" || input.lifeMode === "VACATION" ? input.lifeMode : undefined;
  if (trigger === "LIFE_MODE" && !lifeMode) return { ok: false, status: 400, message: "Выберите режим" };
  const conditions = cleanConditions(input.conditions, companyId, objectId, unitId, viewer.value);
  if (!Array.isArray(conditions)) return conditions;
  const schedule = cleanSchedule(trigger, input.scheduleHour, input.scheduleMinute);
  if (!schedule.ok) return schedule;
  const involved = [...steps, ...conditions]
    .map((item) => findDevice("deviceId" in item ? item.deviceId : ""))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const scenario: Scenario = {
    id: newId("scen"),
    companyId,
    objectId,
    unitId,
    name,
    description: typeof input.description === "string" ? input.description.trim().slice(0, 200) : "",
    trigger,
    lifeMode,
    enabled: true,
    conditions,
    scheduleHour: schedule.value.hour,
    scheduleMinute: schedule.value.minute,
    steps,
    runtime: pickRuntime(trigger, input.runtime, involved),
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
    description?: unknown;
    trigger?: unknown;
    lifeMode?: unknown;
    steps?: unknown;
    conditions?: unknown;
    scheduleHour?: unknown;
    scheduleMinute?: unknown;
    enabled?: unknown;
    runtime?: unknown;
  },
): Result<{ id: string }> {
  const found = scopedScenario(session, input.scenarioId);
  if (!found.ok) return found;
  const viewer = found.value.viewer;
  if (!viewerCanEdit(viewer) || !viewerOwns(viewer, found.value.scenario)) return denied();
  const file = readOps();
  const current = file.scenarios.find((item) => item.id === found.value.scenario.id);
  if (!current) return { ok: false, status: 404, message: "Сценарий не найден" };
  const next: Scenario = { ...current };
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (typeof name !== "string") return name;
    next.name = name;
  }
  if (typeof input.description === "string") next.description = input.description.trim().slice(0, 200);
  if (input.trigger === "LIFE_MODE" || input.trigger === "MANUAL" || input.trigger === "EVENT" || input.trigger === "SCHEDULE") {
    next.trigger = input.trigger;
  }
  if (input.lifeMode === "HOME" || input.lifeMode === "WORK" || input.lifeMode === "VACATION" || input.lifeMode === null) {
    next.lifeMode = input.lifeMode ?? undefined;
  }
  if (next.trigger === "LIFE_MODE" && !next.lifeMode) return { ok: false, status: 400, message: "Выберите режим" };
  if (input.enabled === true || input.enabled === false) next.enabled = input.enabled;
  if (input.conditions !== undefined) {
    const conditions = cleanConditions(input.conditions, current.companyId, current.objectId, current.unitId, viewer);
    if (!Array.isArray(conditions)) return conditions;
    next.conditions = conditions;
  }
  if (input.scheduleHour !== undefined || input.scheduleMinute !== undefined || next.trigger !== current.trigger) {
    const schedule = cleanSchedule(next.trigger, input.scheduleHour ?? current.scheduleHour, input.scheduleMinute ?? current.scheduleMinute);
    if (!schedule.ok) return schedule;
    next.scheduleHour = schedule.value.hour;
    next.scheduleMinute = schedule.value.minute;
  }
  if (input.steps !== undefined) {
    const steps = cleanSteps(input.steps, current.companyId, current.objectId, current.unitId, viewer);
    if (!Array.isArray(steps)) return steps;
    next.steps = steps;
  }
  const involved = [...next.steps, ...(next.conditions ?? [])]
    .map((item) => findDevice(item.deviceId))
    .filter((item): item is Device => Boolean(item));
  next.runtime = pickRuntime(next.trigger, input.runtime ?? next.runtime, involved);
  Object.assign(current, next);
  writeOps(file);
  recordAudit({
    actorUserId: actorUser(viewer),
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
  const { scenario, viewer } = found.value;
  if (!viewerCanEdit(viewer) || !viewerOwns(viewer, scenario)) return denied();
  const file = readOps();
  file.scenarios = file.scenarios.filter((item) => item.id !== scenario.id);
  writeOps(file);
  recordAudit({
    actorUserId: actorUser(viewer),
    companyId: scenario.companyId,
    objectId: scenario.objectId,
    unitId: scenario.unitId,
    action: "SCENARIO_DELETE",
    targetType: "scenario",
    targetId: scenario.id,
    target: scenario.name,
  });
  return { ok: true, value: { id: scenario.id } };
}

type RunValue = { confirmed: boolean; needsConfirm?: boolean; token?: string; message: string; ran: number; total?: number; failed?: number };

function runMessage(ran: number, total: number, failed: number, pending: number): string {
  if (!total) return "Нет безопасных шагов.";
  if (failed && !ran && !pending) return "Сценарий не выполнен.";
  if (failed) return `Выполнено ${ran} из ${total}, ошибок: ${failed}.`;
  if (pending) return ran ? `Выполнено ${ran} из ${total}, остальное принято контроллером.` : "Сценарий принят. Ожидаем подтверждение оборудования.";
  return "Сценарий выполнен.";
}

export async function runScenario(
  session: SessionRef | null,
  input: { scenarioId?: unknown; confirmToken?: unknown },
  options?: { skipHigh?: boolean },
): Promise<Result<RunValue>> {
  const found = scopedScenario(session, input.scenarioId);
  if (!found.ok) return found;
  const { scenario, viewer } = found.value;
  if (scenario.enabled === false) return { ok: false, status: 409, message: "Сценарий выключен." };
  if (!viewerCommands(viewer)) return denied();
  const userId = actorUser(viewer);

  const checked: { step: ScenarioStep; high: boolean }[] = [];
  for (const step of scenario.steps) {
    const check = checkStep(viewer, step.deviceId, step.command);
    if (!check.ok) {
      if (check.status === 403 && options?.skipHigh) continue;
      return check;
    }
    const high = check.risk === "HIGH";
    if (high && options?.skipHigh) continue;
    checked.push({ step, high });
  }
  if (!checked.length) return { ok: true, value: { confirmed: true, message: "Нет безопасных шагов.", ran: 0, total: 0 } };
  const needsHigh = checked.some((item) => item.high);
  if (needsHigh && !takeConfirm(userId, input.confirmToken, scenario.id, "runScenario")) {
    if (typeof input.confirmToken === "string" && input.confirmToken) return { ok: false, status: 400, message: "Подтверждение не найдено." };
    const token = askConfirm(userId, scenario.id, "runScenario");
    return { ok: true, value: { confirmed: false, needsConfirm: true, token, message: "Подтвердите сценарий.", ran: 0 } };
  }

  if (scenarioRuntime(scenario) === "gateway") {
    const queued = enqueueScenarioOnGateway(
      { ...scenario, steps: checked.map((item) => item.step) },
      { skipHigh: options?.skipHigh },
    );
    if (!queued) return { ok: false, status: 409, message: "Шлюз сценария не найден." };
    recordAudit({
      actorUserId: userId,
      companyId: scenario.companyId,
      objectId: scenario.objectId,
      unitId: scenario.unitId,
      action: "SCENARIO_RUN",
      targetType: "scenario",
      targetId: scenario.id,
      target: scenario.name,
      reason: queued.queued ? "Очередь шлюза" : "Отправлено на шлюз",
    });
    return {
      ok: true,
      value: {
        confirmed: false,
        message: queued.queued ? "Шлюз недоступен. Сценарий в очереди." : "Сценарий отправлен на шлюз.",
        ran: 0,
        total: queued.steps,
      },
    };
  }

  let ran = 0;
  let failed = 0;
  let pending = 0;
  for (const { step } of checked) {
    const result = await commandDeviceSmart(
      session,
      { deviceId: step.deviceId, command: step.command, value: step.value, source: "scenario" },
      { preconfirmed: true },
    );
    if (!result.ok || result.value.status === "failed") failed += 1;
    else if (result.value.confirmed) ran += 1;
    else pending += 1;
  }
  recordAudit({
    actorUserId: userId,
    companyId: scenario.companyId,
    objectId: scenario.objectId,
    unitId: scenario.unitId,
    action: "SCENARIO_RUN",
    targetType: "scenario",
    targetId: scenario.id,
    target: scenario.name,
    result: failed ? "ERROR" : "SUCCESS",
    reason: `ran=${ran}; pending=${pending}; failed=${failed}`,
  });
  return {
    ok: true,
    value: { confirmed: failed === 0 && pending === 0, message: runMessage(ran, checked.length, failed, pending), ran, total: checked.length, failed },
  };
}

function scenarioDeviceAllowed(scenario: Scenario, device: Device): boolean {
  if (device.companyId !== scenario.companyId || device.objectId !== scenario.objectId) return false;
  if (scenario.unitId && device.unitId && device.unitId !== scenario.unitId) return false;
  return device.work !== "FAULT" && device.work !== "OFF";
}

export async function runScenarioAutomatically(scenario: Scenario): Promise<{ ran: number; total: number }> {
  if (scenario.enabled === false) return { ran: 0, total: 0 };
  if (scenarioRuntime(scenario) === "gateway") {
    const queued = enqueueScenarioOnGateway(scenario, { skipHigh: true });
    return { ran: 0, total: queued?.steps ?? 0 };
  }
  let ran = 0;
  let total = 0;
  for (const step of scenario.steps) {
    const device = findDevice(step.deviceId);
    if (!device || !isSmartCommand(step.command) || !scenarioDeviceAllowed(scenario, device)) continue;
    if (commandRisk(step.command, device) === "HIGH") continue;
    total += 1;
    const result = await dispatchPhysicalCommand(device, step.command, step.value);
    if (result.status !== "failed") ran += 1;
  }
  recordAudit({
    actorUserId: "system",
    companyId: scenario.companyId,
    objectId: scenario.objectId,
    unitId: scenario.unitId,
    action: "SCENARIO_RUN",
    targetType: "scenario",
    targetId: scenario.id,
    target: scenario.name,
    result: ran === total ? "SUCCESS" : "ERROR",
    reason: `auto; ran=${ran}; total=${total}`,
  });
  return { ran, total };
}

function asTrigger(value: unknown): ScenarioTrigger {
  if (value === "LIFE_MODE" || value === "EVENT" || value === "SCHEDULE") return value;
  return "MANUAL";
}

function cleanConditions(value: unknown, companyId: string, objectId: string, unitId: string | null, viewer: Viewer): ScenarioCondition[] | Failure {
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
    const device = viewerDevice(viewer, row.deviceId, companyId, objectId, unitId);
    if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
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

export async function runEventScenarios(deviceId: string): Promise<void> {
  const device = findDevice(deviceId);
  if (!device) return;
  const rows = readOps().scenarios.filter(
    (scenario) =>
      scenario.trigger === "EVENT" &&
      scenario.enabled !== false &&
      scenarioRuntime(scenario) === "cloud" &&
      scenario.companyId === device.companyId &&
      scenario.objectId === device.objectId &&
      (scenario.conditions ?? []).some((item) => item.deviceId === deviceId) &&
      (scenario.conditions ?? []).every(conditionMet),
  );
  for (const scenario of rows) {
    await runScenarioAutomatically(scenario);
  }
}

function localClock(now: Date): { hour: number; minute: number; today: string } {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
  const minute = Number(new Intl.DateTimeFormat("en-GB", { minute: "2-digit", timeZone }).format(now));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return { hour, minute, today };
}

export async function runDueSchedules(scope?: { companyId: string; objectId?: string }): Promise<void> {
  const now = new Date();
  const { hour, minute, today } = localClock(now);
  const nowMinutes = hour * 60 + minute;
  const file = readOps();
  const due = file.scenarios.filter((scenario) => {
    if (scenario.trigger !== "SCHEDULE" || scenario.enabled === false || scenarioRuntime(scenario) !== "cloud") return false;
    if (scope && (scenario.companyId !== scope.companyId || (scope.objectId && scenario.objectId !== scope.objectId))) return false;
    if (scenario.lastRunAt === today || scenario.scheduleHour === undefined || scenario.scheduleMinute === undefined) return false;
    const at = scenario.scheduleHour * 60 + scenario.scheduleMinute;
    return nowMinutes >= at && nowMinutes - at <= 15;
  });
  if (!due.length) return;
  for (const scenario of due) {
    const current = file.scenarios.find((item) => item.id === scenario.id);
    if (current) current.lastRunAt = today;
  }
  writeOps(file);
  for (const scenario of due) {
    await runScenarioAutomatically(scenario);
  }
}

export async function runLifeModeScenarios(session: SessionRef | null, unitId: string, mode: "HOME" | "WORK" | "VACATION"): Promise<void> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return;
  const rows = readOps().scenarios.filter(
    (scenario) =>
      scenario.trigger === "LIFE_MODE" &&
      scenario.lifeMode === mode &&
      scenario.enabled !== false &&
      viewerReaches(viewer.value, scenario) &&
      (scenario.unitId === unitId || scenario.unitId === null),
  );
  for (const scenario of rows) {
    await runScenario(session, { scenarioId: scenario.id }, { skipHigh: true });
  }
}
