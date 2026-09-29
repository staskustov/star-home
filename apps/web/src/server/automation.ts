import { cloudExecutesAdapter } from "@/server/gateway-adapter";
import { isGatewayStale } from "@/server/gateway-contact";
import { enqueueGatewayCommand } from "@/server/gateway-queue";
import { emitLive } from "@/server/live-bus";
import {
  findDevice,
  findGateway,
  readOps,
  writeOps,
  type Device,
  type Scenario,
  type ScenarioTrigger,
} from "@/server/ops-store";
import { timeZone } from "@/server/time-zone";
import { commandRisk, isSmartCommand } from "@/server/smart-commands";

export type ScenarioRuntime = "cloud" | "gateway";

export type GatewayAutomationPack = {
  timeZone: string;
  scenarios: {
    id: string;
    trigger: ScenarioTrigger;
    enabled: boolean;
    conditions: { deviceId: string; field: string; value: unknown }[];
    scheduleHour?: number | null;
    scheduleMinute?: number | null;
    steps: { deviceId: string; command: string; value?: unknown }[];
    skipHigh: boolean;
  }[];
  critical: {
    id: string;
    when: { deviceId: string; field: string; value: unknown }[];
    steps: { deviceId: string; command: string; value?: unknown }[];
    retryMs: number;
  }[];
  devices: {
    id: string;
    externalId: string | null;
    adapter: string;
    kind: string;
    endpoint: string | null;
  }[];
};

export function scenarioRuntime(scenario: { runtime?: unknown }): ScenarioRuntime {
  return scenario.runtime === "gateway" ? "gateway" : "cloud";
}

export function inferScenarioRuntime(trigger: ScenarioTrigger, devices: Device[]): ScenarioRuntime {
  if (trigger !== "EVENT" && trigger !== "SCHEDULE") return "cloud";
  const gatewayIds = [...new Set(devices.map((device) => device.gatewayId).filter((id): id is string => Boolean(id)))];
  if (gatewayIds.length !== 1) return "cloud";
  const gateway = findGateway(gatewayIds[0]);
  if (!gateway || cloudExecutesAdapter(gateway.adapter)) return "cloud";
  return "gateway";
}

export function scenarioGateway(scenario: Scenario): ReturnType<typeof findGateway> {
  const devices = [...(scenario.steps ?? []), ...(scenario.conditions ?? [])]
    .map((item) => findDevice(item.deviceId))
    .filter((item): item is Device => Boolean(item));
  const ids = [...new Set(devices.map((device) => device.gatewayId).filter((id): id is string => Boolean(id)))];
  return ids.length === 1 ? findGateway(ids[0]) : undefined;
}

export function scenarioExecutes(scenario: Scenario): boolean {
  if (scenario.enabled === false) return false;
  if (scenarioRuntime(scenario) === "cloud") return true;
  const gateway = scenarioGateway(scenario);
  if (!gateway || gateway.status === "OFFLINE") return false;
  return !isGatewayStale(gateway);
}

function closeStep(device: Device): { deviceId: string; command: string; value?: unknown } | null {
  const caps = device.capabilities ?? [];
  const channels = device.channels ?? [];
  const has = (capability: string) =>
    channels.some((channel) => channel.capability === capability && channel.enabled !== false && channel.writable) ||
    (!channels.length && caps.includes(capability as never));
  if (has("power")) return { deviceId: device.id, command: "setPower", value: false };
  if (has("latch") || has("position")) return { deviceId: device.id, command: "close" };
  if (device.kind === "IRRIGATION" || device.kind === "WATER") return { deviceId: device.id, command: "setPower", value: false };
  return null;
}

function lightStep(device: Device): { deviceId: string; command: string; value?: unknown } | null {
  if (device.kind !== "LIGHTING") return null;
  return { deviceId: device.id, command: "setPower", value: true };
}

export function packAutomations(gatewayId: string): GatewayAutomationPack {
  const file = readOps();
  const gateway = file.gateways.find((item) => item.id === gatewayId);
  const devices = file.devices.filter((device) => device.gatewayId === gatewayId && device.status !== "REMOVED");
  const scenarios = file.scenarios.filter((scenario) => {
    if (scenarioRuntime(scenario) !== "gateway") return false;
    if (gateway && scenario.objectId !== gateway.objectId) return false;
    const involved = [...(scenario.steps ?? []), ...(scenario.conditions ?? [])].map((item) => item.deviceId);
    return involved.some((id) => devices.some((device) => device.id === id));
  });
  const leaks = devices.filter((device) => device.kind === "LEAK");
  const valves = devices.filter((device) => device.kind === "WATER" || device.kind === "IRRIGATION");
  const alarms = devices.filter((device) => device.kind === "SMOKE" || device.kind === "FIRE");
  const lights = devices.filter((device) => device.kind === "LIGHTING");
  const critical: GatewayAutomationPack["critical"] = [];
  if (leaks.length && valves.length) {
    const steps = valves.map(closeStep).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (steps.length) {
      critical.push({
        id: "critical-leak",
        when: leaks.map((device) => ({ deviceId: device.id, field: "detected", value: true })),
        steps,
        retryMs: 60_000,
      });
    }
  }
  if (alarms.length && lights.length) {
    const steps = lights.map(lightStep).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (steps.length) {
      critical.push({
        id: "critical-fire",
        when: alarms.map((device) => ({ deviceId: device.id, field: "detected", value: true })),
        steps,
        retryMs: 60_000,
      });
    }
  }
  return {
    timeZone,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      trigger: scenario.trigger,
      enabled: scenario.enabled !== false,
      conditions: scenario.conditions ?? [],
      scheduleHour: scenario.scheduleHour ?? null,
      scheduleMinute: scenario.scheduleMinute ?? null,
      steps: scenario.steps,
      skipHigh: true,
    })),
    critical,
    devices: devices.map((device) => ({
      id: device.id,
      externalId: device.externalId ?? null,
      adapter: device.adapter,
      kind: device.kind,
      endpoint: device.endpoint ?? null,
    })),
  };
}

export function enqueueScenarioOnGateway(scenario: Scenario): { commandId: string; queued: boolean } | null {
  const gateway = scenarioGateway(scenario);
  if (!gateway || cloudExecutesAdapter(gateway.adapter)) return null;
  const steps = scenario.steps.map((step) => {
    const device = findDevice(step.deviceId);
    return {
      deviceId: step.deviceId,
      command: step.command,
      value: step.value,
      externalId: device?.externalId ?? null,
      endpoint: device?.endpoint ?? null,
      adapter: device?.adapter ?? gateway.adapter,
    };
  });
  const queued = enqueueGatewayCommand({
    gatewayId: gateway.id,
    deviceId: scenario.id,
    command: "runScenario",
    value: { scenarioId: scenario.id, steps },
  });
  return { commandId: queued.id, queued: gateway.status === "OFFLINE" };
}

export function ingestAutomationRun(
  gatewayId: string,
  input: { runId?: unknown; scenarioId?: unknown; ruleId?: unknown; confirmed?: unknown; at?: unknown },
): { applied: boolean } {
  const runId = typeof input.runId === "string" && input.runId.trim() ? input.runId.trim().slice(0, 120) : "";
  if (!runId) return { applied: false };
  const file = readOps();
  const gateway = file.gateways.find((item) => item.id === gatewayId);
  if (!gateway) return { applied: false };
  if (file.automationRuns.some((item) => item.id === runId)) return { applied: false };
  const at = typeof input.at === "string" && input.at ? input.at : new Date().toISOString();
  const scenarioId = typeof input.scenarioId === "string" ? input.scenarioId : undefined;
  const ruleId = typeof input.ruleId === "string" ? input.ruleId : undefined;
  file.automationRuns.unshift({
    id: runId,
    gatewayId,
    scenarioId,
    ruleId,
    at,
    confirmed: input.confirmed === true,
  });
  file.automationRuns = file.automationRuns.slice(0, 200);
  const scenario = scenarioId ? file.scenarios.find((item) => item.id === scenarioId) : undefined;
  if (scenario) scenario.lastRunAt = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(at));
  writeOps(file);
  emitLive({
    objectId: gateway.objectId,
    kind: "device",
    title: scenario ? `${scenario.name}: локальный сценарий` : "Локальное правило сработало",
    gatewayId,
  });
  return { applied: true };
}

export function stepIsHigh(device: Device, command: string): boolean {
  return isSmartCommand(command) && commandRisk(command, device) === "HIGH";
}
