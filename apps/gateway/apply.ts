export type ApplyCommand = {
  id: string;
  deviceId: string;
  command: string;
  value?: unknown;
  externalId?: string | null;
  endpoint?: string | null;
  adapter?: string | null;
};

export type ApplyResult = {
  confirmed: boolean;
  sent?: boolean;
  error?: string;
  state?: Record<string, unknown>;
  devices?: unknown;
  frame?: string;
};

export type ApplyContext = {
  echo?: boolean;
  discover: () => { confirmed: boolean; devices?: unknown; error?: string };
  publishMqtt?: (topic: string, payload: string) => Promise<boolean>;
  fetchHttp?: typeof fetch;
  readSeq?: (topic: string) => number;
  waitMqtt?: (
    topic: string,
    match: (value: unknown) => boolean,
    timeoutMs: number,
    afterSeq: number,
    signal?: AbortSignal,
  ) => Promise<unknown | undefined>;
  commandTimeoutMs?: number;
  commandRetries?: number;
};

export function wirenboardSetTopic(externalId: string, command: string): string {
  const control =
    command === "setPower" || command === "open" || command === "close"
      ? "on"
      : command === "setBrightness"
        ? "brightness"
        : command === "setTemperature" || command === "setHvacMode"
          ? "target"
          : command === "setPosition" || command === "stop"
            ? "position"
            : "command";
  return `/devices/${externalId}/controls/${control}/on`;
}

export function wirenboardReadTopic(externalId: string, command: string): string {
  const setTopic = wirenboardSetTopic(externalId, command);
  return setTopic.endsWith("/on") ? setTopic.slice(0, -3) : setTopic;
}

export function wirenboardSetPayload(command: string, value: unknown): string {
  if (command === "close" || command === "stop") return "0";
  if (command === "open") return "1";
  if (command === "setPower") return value === false || value === 0 || value === "0" ? "0" : "1";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "1";
}

export function payloadMatches(expected: string, actual: unknown): boolean {
  if (actual === undefined || actual === null) return false;
  const got =
    typeof actual === "string" || typeof actual === "number" || typeof actual === "boolean"
      ? String(actual).trim()
      : "";
  if (!got && actual !== 0 && actual !== false) return false;
  const want = expected.trim();
  if (got === want) return true;
  const lowerGot = got.toLowerCase();
  const lowerWant = want.toLowerCase();
  const on = new Set(["1", "true", "on"]);
  const off = new Set(["0", "false", "off"]);
  if (on.has(lowerWant) && on.has(lowerGot)) return true;
  if (off.has(lowerWant) && off.has(lowerGot)) return true;
  const nWant = Number(want);
  const nGot = Number(got);
  if (Number.isFinite(nWant) && Number.isFinite(nGot)) return Math.abs(nWant - nGot) < 0.05;
  return false;
}

export function expectedState(command: string, value: unknown): Record<string, unknown> | undefined {
  if (command === "setPower") return { on: !(value === false || value === 0 || value === "0") };
  if (command === "open") return { latch: "OPEN" };
  if (command === "close") return { latch: "CLOSED" };
  if (command === "setBrightness") {
    const brightness = Number(value);
    return Number.isFinite(brightness) ? { brightness: Math.min(100, Math.max(0, Math.round(brightness))), on: brightness > 0 } : undefined;
  }
  if (command === "setTemperature") {
    const target = Number(value);
    return Number.isFinite(target) ? { targetC: Math.round(target * 10) / 10 } : undefined;
  }
  if (command === "setPosition") {
    const position = Number(value);
    return Number.isFinite(position) ? { position: Math.min(100, Math.max(0, Math.round(position))) } : undefined;
  }
  return undefined;
}

function commandTimeoutMs(value: number | undefined): number {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return 4_000;
  return Math.min(30_000, Math.max(200, timeout));
}

function commandAttempts(retries: number | undefined): number {
  const extra = Number(retries);
  if (!Number.isFinite(extra)) return 3;
  return Math.min(5, Math.max(1, Math.floor(extra) + 1));
}

async function applyHttp(command: ApplyCommand, fetchHttp: typeof fetch): Promise<ApplyResult> {
  if (!command.endpoint) return { confirmed: false, error: "no-endpoint" };
  const response = await fetchHttp(command.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: command.command, value: command.value, deviceId: command.deviceId }),
  }).catch(() => null);
  if (!response?.ok) return { confirmed: false, sent: Boolean(response), error: "unreachable" };
  const payload = (await response.json().catch(() => null)) as { confirmed?: boolean; state?: Record<string, unknown> } | null;
  return {
    confirmed: payload?.confirmed === true,
    sent: true,
    state: payload?.state,
    error: payload?.confirmed === true ? undefined : "http-unconfirmed",
  };
}

async function applyMqtt(command: ApplyCommand, ctx: ApplyContext): Promise<ApplyResult> {
  if (!command.externalId) return { confirmed: false, error: "no-external-id" };
  if (!ctx.publishMqtt) return { confirmed: false, error: "mqtt-offline" };
  const writeTopic = wirenboardSetTopic(command.externalId, command.command);
  const readTopic = wirenboardReadTopic(command.externalId, command.command);
  const payload = wirenboardSetPayload(command.command, command.value);
  const match = (value: unknown) => payloadMatches(payload, value);

  if (!ctx.waitMqtt) {
    const published = await ctx.publishMqtt(writeTopic, payload);
    if (!published) return { confirmed: false, error: "mqtt-offline" };
    return { confirmed: false, sent: true };
  }

  const timeoutMs = commandTimeoutMs(ctx.commandTimeoutMs);
  const attempts = commandAttempts(ctx.commandRetries);
  let sent = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const afterSeq = ctx.readSeq?.(readTopic) ?? 0;
    const abort = new AbortController();
    const pending = ctx.waitMqtt(readTopic, match, timeoutMs, afterSeq, abort.signal);
    const published = await ctx.publishMqtt(writeTopic, payload);
    if (!published) {
      abort.abort();
      await pending.catch(() => undefined);
      if (attempt < attempts - 1) continue;
      return { confirmed: false, sent, error: "mqtt-offline" };
    }
    sent = true;
    const actual = await pending;
    if (actual !== undefined) {
      return { confirmed: true, sent: true, state: expectedState(command.command, command.value) };
    }
  }
  return { confirmed: false, sent, error: sent ? "mqtt-timeout" : "mqtt-offline" };
}

export async function applyQueuedCommand(command: ApplyCommand, ctx: ApplyContext): Promise<ApplyResult> {
  if (command.command === "discover") {
    const found = ctx.discover();
    return found.confirmed
      ? { confirmed: true, devices: found.devices }
      : { confirmed: false, error: found.error ?? "no-discovery-source" };
  }
  if (command.command === "captureFrame") {
    return { confirmed: false, error: "camera-via-capture" };
  }
  if (ctx.echo) {
    return { confirmed: true, sent: true, state: expectedState(command.command, command.value) };
  }
  if (command.endpoint || command.adapter === "http") {
    return applyHttp(command, ctx.fetchHttp ?? fetch);
  }
  const mqttKind = command.adapter === "wirenboard" || command.adapter === "mqtt";
  if (mqttKind) return applyMqtt(command, ctx);
  return { confirmed: false, error: "agent-unapplied" };
}
