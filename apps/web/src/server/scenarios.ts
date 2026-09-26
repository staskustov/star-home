import type { SessionRef } from "@/server/actor";
import { findObject } from "@/server/catalog-store";
import { commandDeviceSmart, smartViewer, viewerReaches } from "@/server/smart-home";
import { recordAudit } from "@/server/operations";
import { findDevice, newId, readOps, writeOps, type Scenario, type ScenarioStep, type ScenarioTrigger } from "@/server/ops-store";
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
  input: { objectId?: unknown; unitId?: unknown; name?: unknown; trigger?: unknown; lifeMode?: unknown; steps?: unknown },
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
  const trigger: ScenarioTrigger = input.trigger === "LIFE_MODE" ? "LIFE_MODE" : "MANUAL";
  const lifeMode = input.lifeMode === "HOME" || input.lifeMode === "WORK" || input.lifeMode === "VACATION" ? input.lifeMode : undefined;
  if (trigger === "LIFE_MODE" && !lifeMode) return { ok: false, status: 400, message: "Выберите режим" };
  const scenario: Scenario = {
    id: newId("scen"),
    companyId,
    objectId,
    unitId: viewer.value.kind === "home" ? viewer.value.place.unitId : typeof input.unitId === "string" ? input.unitId : null,
    name,
    trigger,
    lifeMode,
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
  input: { scenarioId?: unknown; name?: unknown; trigger?: unknown; lifeMode?: unknown; steps?: unknown },
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
  if (input.trigger === "LIFE_MODE" || input.trigger === "MANUAL") current.trigger = input.trigger;
  if (input.lifeMode === "HOME" || input.lifeMode === "WORK" || input.lifeMode === "VACATION" || input.lifeMode === null) {
    current.lifeMode = input.lifeMode ?? undefined;
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
