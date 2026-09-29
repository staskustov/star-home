/**
 * STAR HOME Local Gateway agent.
 * Runs on the object LAN. Does not open controller MQTT to the internet.
 * Confirms nothing it did not actually apply.
 *
 *   STAR_HOME_CLOUD_URL=http://127.0.0.1:3456 \
 *   STAR_HOME_GATEWAY_TOKEN=... \
 *   STAR_HOME_WB_MQTT_URL=mqtt://127.0.0.1:1883 \
 *   npx tsx apps/gateway/agent.ts
 */

import { readFileSync } from "fs";
import { captureCameraFrame } from "./camera-capture";
import { createCommandOnce } from "./command-once";
import { createLocalRuntime, type AutomationPack, type AutomationReport } from "./local-runtime";
import { createOutboundBuffer, shouldBufferStatus, type OutboundItem } from "./outbound-buffer";
import { connectLocalMqtt, parseMqttPayload, type MqttSession } from "./mqtt-session";
import { createTopicCache } from "./topic-cache";
import { controlCapability, groupWirenboardControls, parseWirenboardControlTopic, readControlValue, type WbTopicValue } from "./wb-controls";

export const agentVersion = "agent-6";

const cloud = (process.env.STAR_HOME_CLOUD_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");
const token = process.env.STAR_HOME_GATEWAY_TOKEN ?? "";
const intervalMs = Number(process.env.STAR_HOME_GATEWAY_INTERVAL_MS ?? 20_000);
const echo = process.env.STAR_HOME_GATEWAY_ECHO === "1" || process.env.STAR_HOME_DEMO === "1";

function assertCloudUrl(url: string) {
  const parsed = new URL(url);
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !local) {
    throw new Error("STAR_HOME_CLOUD_URL must use https unless the host is localhost");
  }
}

assertCloudUrl(cloud);

function asTopics(parsed: unknown): WbTopicValue[] | null {
  if (Array.isArray(parsed)) {
    const rows = parsed
      .map((item) => {
        if (typeof item === "string") return { topic: item };
        if (item && typeof item === "object" && typeof (item as { topic?: unknown }).topic === "string") {
          return { topic: (item as { topic: string }).topic, value: (item as { value?: unknown }).value };
        }
        return null;
      })
      .filter((item): item is WbTopicValue => Boolean(item));
    return rows.length ? rows : null;
  }
  if (parsed && typeof parsed === "object") {
    const topics = (parsed as { topics?: unknown }).topics;
    if (Array.isArray(topics)) return asTopics(topics);
    const entries = Object.entries(parsed as Record<string, unknown>).filter(([topic]) => topic.includes("/controls/"));
    return entries.length ? entries.map(([topic, value]) => ({ topic, value })) : null;
  }
  return null;
}

function loadDiscoverySnapshot(): WbTopicValue[] | null {
  const raw = process.env.STAR_HOME_WB_DISCOVERY;
  if (!raw?.trim()) return null;
  try {
    const text = raw.trim().startsWith("{") || raw.trim().startsWith("[") ? raw : readFileSync(raw, "utf8");
    return asTopics(JSON.parse(text));
  } catch {
    return null;
  }
}

const cache = createTopicCache();
const buffer = createOutboundBuffer({ path: process.env.STAR_HOME_GATEWAY_BUFFER_PATH });
const applied = createCommandOnce<ApplyResult>();
const commandTimeoutMs = Number(process.env.STAR_HOME_WB_COMMAND_TIMEOUT_MS ?? 4_000);
const commandRetries = Number(process.env.STAR_HOME_WB_COMMAND_RETRIES ?? 2);

let mqttSession: MqttSession | null = null;
let evalChain = Promise.resolve();

function applyContext() {
  return {
    echo,
    discover: discoverLocal,
    publishMqtt: mqttSession ? (topic: string, payload: string) => mqttSession!.publish(topic, payload) : undefined,
    readSeq: (topic: string) => cache.seq(topic),
    waitMqtt: (
      topic: string,
      match: (value: unknown) => boolean,
      timeoutMs: number,
      afterSeq: number,
      signal?: AbortSignal,
    ) => cache.waitFor(topic, match, timeoutMs, afterSeq, signal),
    commandTimeoutMs: Number.isFinite(commandTimeoutMs) ? commandTimeoutMs : 4_000,
    commandRetries: Number.isFinite(commandRetries) ? commandRetries : 2,
  };
}

async function applyHardware(command: ApplyCommand): Promise<ApplyResult> {
  return applied.run(command.id, () => applyQueuedCommand(command, applyContext()));
}

const runtime = createLocalRuntime({
  apply: (command) => applyHardware(command),
});

function discoverLocal() {
  const live = cache.devices();
  if (live.length) return { confirmed: true as const, devices: live };
  const snapshot = loadDiscoverySnapshot();
  if (!snapshot) return { confirmed: false as const, error: "no-discovery-source" };
  return { confirmed: true as const, devices: groupWirenboardControls(snapshot) };
}

async function postChannel(kind: string, extra: Record<string, unknown> = {}) {
  if (!token) throw new Error("STAR_HOME_GATEWAY_TOKEN is required");
  const response = await fetch(`${cloud}/api/smart-home/gateways/channel`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-star-home-gateway": token },
    body: JSON.stringify({ kind, ...extra }),
  }).catch(() => null);
  if (!response) {
    buffer.push({ kind, extra } satisfies OutboundItem);
    throw new Error("cloud-unreachable");
  }
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    commands?: ApplyCommand[];
    automations?: AutomationPack;
  };
  if (shouldBufferStatus(response.status)) {
    buffer.push({ kind, extra } satisfies OutboundItem);
    throw new Error(body.message ?? `HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

async function call(kind: string, extra: Record<string, unknown> = {}) {
  try {
    await buffer.flush((bufferedKind, bufferedExtra) => postChannel(bufferedKind, bufferedExtra));
  } catch {
    buffer.push({ kind, extra });
    throw new Error("gateway-cloud-unavailable");
  }
  return postChannel(kind, extra);
}

async function reportAutomations(reports: AutomationReport[]) {
  for (const report of reports) {
    await call("automation", { ...report }).catch(() => undefined);
  }
}

function queueEvaluate(kind: "event" | "schedule") {
  evalChain = evalChain.then(async () => {
    try {
      const reports = kind === "event" ? await runtime.evaluateEvents() : await runtime.evaluateSchedule();
      await reportAutomations(reports);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  });
  return evalChain;
}

async function publishSnapshot() {
  const found = discoverLocal();
  if (!found.confirmed || !found.devices) return;
  for (const device of found.devices) {
    await call("state", {
      externalId: device.externalId,
      channels: device.channels.map((channel) => ({
        externalId: channel.externalId,
        capability: channel.capability,
        value: channel.value,
      })),
    }).catch(() => undefined);
  }
}

function onMqttMessage(topic: string, payload: Buffer) {
  const value = parseMqttPayload(payload);
  cache.ingest(topic, value);
  const parsed = parseWirenboardControlTopic(topic);
  if (!parsed) return;
  const device = runtime.pack().devices.find((item) => item.externalId === parsed.externalId);
  if (!device) return;
  const meta = controlCapability(parsed.control);
  runtime.ingestChannels(device.id, [{ capability: meta?.capability ?? null, value: readControlValue(value) }]);
  void queueEvaluate("event");
}

function scenarioSteps(value: unknown): ApplyCommand[] {
  if (!value || typeof value !== "object") return [];
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  const mapped: ApplyCommand[] = [];
  for (const item of steps) {
    if (!item || typeof item !== "object") continue;
    const row = item as { deviceId?: unknown; command?: unknown; value?: unknown; externalId?: unknown; endpoint?: unknown; adapter?: unknown };
    if (typeof row.deviceId !== "string" || typeof row.command !== "string") continue;
    mapped.push({
      id: "",
      deviceId: row.deviceId,
      command: row.command,
      value: row.value,
      externalId: typeof row.externalId === "string" ? row.externalId : null,
      endpoint: typeof row.endpoint === "string" ? row.endpoint : null,
      adapter: typeof row.adapter === "string" ? row.adapter : "wirenboard",
    });
  }
  return mapped;
}

async function applyRunScenario(command: ApplyCommand): Promise<ApplyResult> {
  const value = command.value && typeof command.value === "object" ? (command.value as { scenarioId?: unknown }) : {};
  const scenarioId = typeof value.scenarioId === "string" ? value.scenarioId : command.deviceId;
  const steps = scenarioSteps(command.value);
  let confirmed = true;
  let sent = false;
  for (const [index, step] of steps.entries()) {
    const result = await applyHardware({ ...step, id: `${command.id}:${index}` });
    if (result.sent) sent = true;
    if (!result.confirmed) confirmed = false;
  }
  const at = new Date().toISOString();
  await reportAutomations([{ runId: `manual:${scenarioId}:${command.id}`, scenarioId, confirmed, at }]);
  return { confirmed: steps.length ? confirmed : true, sent: sent || Boolean(steps.length) };
}

async function applyOne(command: ApplyCommand): Promise<ApplyResult> {
  if (command.command === "runScenario") {
    return applied.run(command.id, () => applyRunScenario(command));
  }
  if (command.command === "captureFrame") {
    return applied.run(command.id, () => captureCameraFrame(command));
  }
  return applyHardware(command);
}

function connectionStatus(): { status: "ONLINE" | "DEGRADED" | "OFFLINE"; lastError: string | null } {
  if (!mqttSession) return { status: "ONLINE", lastError: null };
  if (mqttSession.connected()) return { status: "ONLINE", lastError: null };
  if (mqttSession.reconnecting()) return { status: "DEGRADED", lastError: mqttSession.lastError() ?? "mqtt-reconnect" };
  return { status: "DEGRADED", lastError: mqttSession.lastError() };
}

function mqttState(): "up" | "down" | "none" {
  if (!mqttSession) return "none";
  return mqttSession.connected() ? "up" : "down";
}

async function tick() {
  const link = connectionStatus();
  await call("heartbeat", {
    status: link.status,
    version: agentVersion,
    lastError: link.lastError,
    bufferLag: buffer.size(),
    mqtt: mqttState(),
  });
  await publishSnapshot();
  const pulled = await call("pull");
  if (pulled.automations) runtime.load(pulled.automations);
  for (const command of pulled.commands ?? []) {
    const result = await applyOne(command);
    const ack: Record<string, unknown> = {
      commandId: command.id,
      confirmed: result.confirmed,
      sent: result.sent === true,
      error: result.error,
    };
    if (result.confirmed && result.state) ack.state = result.state;
    if (result.devices) ack.devices = result.devices;
    if (result.frame) ack.frame = result.frame;
    await call("ack", ack);
  }
  await queueEvaluate("schedule");
}

function startMqtt() {
  const url = process.env.STAR_HOME_WB_MQTT_URL;
  if (!url?.trim()) return;
  mqttSession = connectLocalMqtt({
    url,
    username: process.env.STAR_HOME_WB_MQTT_USER,
    password: process.env.STAR_HOME_WB_MQTT_PASSWORD,
    clientId: `star-home-gw-${(token || "anon").slice(0, 12)}`,
    onMessage: onMqttMessage,
  });
}

async function main() {
  startMqtt();
  await tick();
  if (process.argv.includes("--once")) {
    await mqttSession?.disconnect();
    return;
  }
  setInterval(() => {
    void tick().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, Number.isFinite(intervalMs) ? Math.max(5_000, intervalMs) : 20_000);
}

if (process.argv[1]?.includes("agent.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { applyOne, discoverLocal, tick, cache, buffer, runtime };
