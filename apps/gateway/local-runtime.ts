import type { ApplyCommand, ApplyResult } from "./apply";

export type RuntimeDevice = {
  id: string;
  externalId: string | null;
  adapter: string;
  kind: string;
  endpoint?: string | null;
};

export type RuntimeStep = {
  deviceId: string;
  command: string;
  value?: unknown;
};

export type RuntimeCondition = {
  deviceId: string;
  field: string;
  value: unknown;
};

export type RuntimeScenario = {
  id: string;
  trigger: "EVENT" | "SCHEDULE" | "MANUAL" | "LIFE_MODE";
  enabled: boolean;
  conditions: RuntimeCondition[];
  scheduleHour?: number | null;
  scheduleMinute?: number | null;
  steps: RuntimeStep[];
  skipHigh?: boolean;
};

export type RuntimeRule = {
  id: string;
  when: RuntimeCondition[];
  steps: RuntimeStep[];
  retryMs?: number;
};

export type AutomationPack = {
  timeZone: string;
  scenarios: RuntimeScenario[];
  critical: RuntimeRule[];
  devices: RuntimeDevice[];
};

export type AutomationReport = {
  runId: string;
  scenarioId?: string;
  ruleId?: string;
  confirmed: boolean;
  at: string;
};

const highKinds = new Set(["GATE", "WICKET", "BARRIER", "LOCK"]);

export function isHighStep(command: string, kind: string): boolean {
  if ((command === "open" || command === "close") && highKinds.has(kind)) return true;
  if ((kind === "WATER" || kind === "IRRIGATION") && (command === "setPower" || command === "open" || command === "close")) return true;
  return false;
}

function flag(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on" || value === "ON") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value === "off" || value === "OFF") return false;
  return null;
}

function same(left: unknown, right: unknown): boolean {
  if (left === undefined || left === null) return false;
  if (left === right) return true;
  if (typeof left === "boolean" || typeof right === "boolean") {
    const a = flag(left);
    const b = flag(right);
    return a !== null && a === b;
  }
  return String(left) === String(right);
}

function fieldOf(state: Record<string, unknown> | undefined, field: string): unknown {
  if (!state) return undefined;
  if (field === "on") return state.on;
  if (field === "latch") return state.latch;
  if (field === "detected") return state.detected;
  if (field === "brightness") return state.brightness;
  return state[field];
}

export function conditionMet(condition: RuntimeCondition, states: Map<string, Record<string, unknown>>): boolean {
  return same(fieldOf(states.get(condition.deviceId), condition.field), condition.value);
}

export function clockParts(now: Date, timeZone: string): { hour: number; minute: number; day: string } {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
  const minute = Number(new Intl.DateTimeFormat("en-GB", { minute: "2-digit", timeZone }).format(now));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return { hour, minute, day };
}

export function mergeChannelState(channels: { capability?: string | null; value?: unknown }[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const channel of channels) {
    if (channel.capability === "power" && flag(channel.value) !== null) next.on = flag(channel.value);
    if (channel.capability === "brightness" && typeof channel.value === "number") next.brightness = channel.value;
    if (channel.capability === "leak" || channel.capability === "smoke" || channel.capability === "motion" || channel.capability === "presence") {
      if (flag(channel.value) !== null) next.detected = flag(channel.value);
    }
    if (channel.capability === "latch") next.latch = channel.value === true || channel.value === 1 || channel.value === "OPEN" ? "OPEN" : "CLOSED";
    if (channel.capability === "position" && typeof channel.value === "number") next.position = channel.value;
  }
  return next;
}

export function createLocalRuntime(opts: {
  apply: (command: ApplyCommand) => Promise<ApplyResult>;
  now?: () => Date;
  initial?: AutomationPack | null;
}) {
  let pack: AutomationPack = { timeZone: "Europe/Moscow", scenarios: [], critical: [], devices: [] };
  const states = new Map<string, Record<string, unknown>>();
  const met = new Map<string, boolean>();
  const lastAt = new Map<string, number>();
  const lastDay = new Map<string, string>();

  function deviceOf(id: string): RuntimeDevice | undefined {
    return pack.devices.find((item) => item.id === id || item.externalId === id);
  }

  async function runSteps(runId: string, steps: RuntimeStep[], skipHigh: boolean): Promise<boolean> {
    let confirmed = true;
    for (const [index, step] of steps.entries()) {
      const device = deviceOf(step.deviceId);
      if (skipHigh && device && isHighStep(step.command, device.kind)) continue;
      const result = await opts.apply({
        id: `${runId}:${index}`,
        deviceId: step.deviceId,
        command: step.command,
        value: step.value,
        externalId: device?.externalId ?? null,
        endpoint: device?.endpoint ?? null,
        adapter: device?.adapter ?? "wirenboard",
        kind: device?.kind ?? null,
      });
      if (!result.confirmed) confirmed = false;
    }
    return confirmed;
  }

  function load(next: AutomationPack) {
    pack = {
      timeZone: next.timeZone || "Europe/Moscow",
      scenarios: Array.isArray(next.scenarios) ? next.scenarios : [],
      critical: Array.isArray(next.critical) ? next.critical : [],
      devices: Array.isArray(next.devices) ? next.devices : [],
    };
  }

  if (opts.initial) load(opts.initial);

  return {
    load,
    ingest(deviceId: string, partial: Record<string, unknown>) {
      const current = states.get(deviceId) ?? {};
      states.set(deviceId, { ...current, ...partial });
    },
    ingestChannels(deviceId: string, channels: { capability?: string | null; value?: unknown }[]) {
      const current = states.get(deviceId) ?? {};
      states.set(deviceId, { ...current, ...mergeChannelState(channels) });
    },
    async evaluateEvents(): Promise<AutomationReport[]> {
      const reports: AutomationReport[] = [];
      const now = (opts.now ?? (() => new Date()))();
      const at = now.toISOString();
      for (const scenario of pack.scenarios) {
        if (scenario.trigger !== "EVENT" || scenario.enabled === false || !scenario.conditions?.length) continue;
        const nowMet = scenario.conditions.every((item) => conditionMet(item, states));
        const was = met.get(scenario.id) === true;
        met.set(scenario.id, nowMet);
        if (!nowMet || was) continue;
        const runId = `scen:${scenario.id}:${at}`;
        const confirmed = await runSteps(runId, scenario.steps, scenario.skipHigh !== false);
        reports.push({ runId, scenarioId: scenario.id, confirmed, at });
      }
      for (const rule of pack.critical) {
        const nowMet = rule.when.length > 0 && rule.when.some((item) => conditionMet(item, states));
        const retryMs = rule.retryMs ?? 60_000;
        const previous = lastAt.get(rule.id) ?? 0;
        if (!nowMet) {
          lastAt.delete(rule.id);
          continue;
        }
        if (previous && now.getTime() - previous < retryMs) continue;
        lastAt.set(rule.id, now.getTime());
        const runId = `rule:${rule.id}:${Math.floor(now.getTime() / retryMs)}`;
        const confirmed = await runSteps(runId, rule.steps, false);
        reports.push({ runId, ruleId: rule.id, confirmed, at });
      }
      return reports;
    },
    async evaluateSchedule(): Promise<AutomationReport[]> {
      const now = (opts.now ?? (() => new Date()))();
      const parts = clockParts(now, pack.timeZone);
      const reports: AutomationReport[] = [];
      for (const scenario of pack.scenarios) {
        if (scenario.trigger !== "SCHEDULE" || scenario.enabled === false) continue;
        if (scenario.scheduleHour !== parts.hour || scenario.scheduleMinute !== parts.minute) continue;
        if (lastDay.get(scenario.id) === parts.day) continue;
        lastDay.set(scenario.id, parts.day);
        const runId = `scen:${scenario.id}:${parts.day}`;
        const confirmed = await runSteps(runId, scenario.steps, scenario.skipHigh !== false);
        reports.push({ runId, scenarioId: scenario.id, confirmed, at: now.toISOString() });
      }
      return reports;
    },
    pack: () => pack,
    states,
  };
}
