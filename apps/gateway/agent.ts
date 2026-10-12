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

import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { applyQueuedCommand, commandExpired, type ApplyCommand, type ApplyResult } from "./apply";
import { captureCameraFrame, type CameraCaptureMedia } from "./camera-capture";
import { createCommandOnce } from "./command-once";
import { createLocalRuntime, isHighStep, type AutomationPack, type AutomationReport } from "./local-runtime";
import { CloudError, createOutboundBuffer, shouldBufferKind, shouldBufferStatus } from "./outbound-buffer";
import { connectLocalMqtt, parseMqttPayload, type MqttSession } from "./mqtt-session";
import { createTopicCache } from "./topic-cache";
import {
  controlCapability,
  groupWirenboardControls,
  normalizeChannelValue,
  parseWirenboardControlTopic,
  parseWirenboardErrorTopic,
  readControlValue,
  type WbTopicValue,
} from "./wb-controls";

export const agentVersion = "agent-7";

const cloud = (process.env.STAR_HOME_CLOUD_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");
const token = process.env.STAR_HOME_GATEWAY_TOKEN ?? "";
const intervalMs = Number(process.env.STAR_HOME_GATEWAY_INTERVAL_MS ?? 20_000);
const scheduleEveryMs = 15_000;
const fullSnapshotMs = 2 * 60_000;

function testMode(): boolean {
  return process.env.STAR_HOME_GATEWAY_TEST === "1";
}

function echoMode(): boolean {
  return testMode() && (process.env.STAR_HOME_GATEWAY_ECHO === "1" || process.env.STAR_HOME_DEMO === "1");
}

function simulatorMode(): boolean {
  return testMode() && process.env.STAR_HOME_GATEWAY_SIMULATOR === "1";
}

function agentMode(): "live" | "echo" | "simulator" {
  if (echoMode()) return "echo";
  if (simulatorMode()) return "simulator";
  return "live";
}

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
const bufferPath = process.env.STAR_HOME_GATEWAY_BUFFER_PATH;
const packPath = process.env.STAR_HOME_GATEWAY_PACK_PATH ?? (bufferPath ? `${dirname(bufferPath)}/automation-pack.json` : undefined);
const buffer = createOutboundBuffer({ path: bufferPath });
const applied = createCommandOnce<ApplyResult>();
const commandTimeoutMs = Number(process.env.STAR_HOME_WB_COMMAND_TIMEOUT_MS ?? 4_000);
const commandRetries = Number(process.env.STAR_HOME_WB_COMMAND_RETRIES ?? 2);

let mqttSession: MqttSession | null = null;
let evalChain = Promise.resolve();
let ticking = false;
let lastFullSnapshot = 0;
const sentSnapshot = new Map<string, string>();
const controlErrors = new Map<string, string>();
let cameras = new Map<string, CameraCaptureMedia>();

function applyContext() {
  return {
    echo: echoMode(),
    mqttConfirm: process.env.STAR_HOME_MQTT_CONFIRM === "state" ? ("state" as const) : ("echo" as const),
    simulator: simulatorMode(),
    allowSimulator: testMode(),
    simulatorDelayMs: Number(process.env.STAR_HOME_SIMULATOR_DELAY_MS ?? 50),
    simulatorFail: process.env.STAR_HOME_SIMULATOR_FAIL === "1",
    simulatorTimeout: process.env.STAR_HOME_SIMULATOR_TIMEOUT === "1",
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

function readPack(): AutomationPack | null {
  if (!packPath) return null;
  try {
    const parsed = JSON.parse(readFileSync(packPath, "utf8")) as AutomationPack;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePack(pack: AutomationPack): void {
  if (!packPath) return;
  try {
    mkdirSync(dirname(packPath), { recursive: true });
    writeFileSync(packPath, JSON.stringify(pack));
  } catch {
    /* disk optional */
  }
}

const runtime = createLocalRuntime({
  apply: (command) => applyHardware(command),
  initial: readPack(),
});

function discoverLocal() {
  const live = cache.devices();
  if (live.length) return { confirmed: true as const, devices: live };
  const snapshot = loadDiscoverySnapshot();
  if (!snapshot) return { confirmed: false as const, error: "no-discovery-source" };
  return { confirmed: true as const, devices: groupWirenboardControls(snapshot) };
}

async function send(kind: string, extra: Record<string, unknown> = {}) {
  if (!token) throw new CloudError("STAR_HOME_GATEWAY_TOKEN is required", false);
  const response = await fetch(`${cloud}/api/smart-home/gateways/channel`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-star-home-gateway": token },
    body: JSON.stringify({ kind, ...extra }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) throw new CloudError("cloud-unreachable", true);
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    commands?: ApplyCommand[];
    automations?: AutomationPack;
    cameras?: (CameraCaptureMedia & { deviceId?: string })[];
  };
  if (!response.ok) throw new CloudError(body.message ?? `HTTP ${response.status}`, shouldBufferStatus(response.status));
  return body;
}

async function call(kind: string, extra: Record<string, unknown> = {}) {
  try {
    return await send(kind, extra);
  } catch (error) {
    if (shouldBufferKind(kind) && (!(error instanceof CloudError) || error.retry)) buffer.push({ kind, extra });
    throw error;
  }
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
  if (mqttSession && !mqttSession.connected()) return;
  const found = discoverLocal();
  if (!found.confirmed || !found.devices) return;
  const now = Date.now();
  const full = now - lastFullSnapshot >= fullSnapshotMs;
  const observedAt = new Date(now).toISOString();
  const items: Record<string, unknown>[] = [];
  for (const device of found.devices) {
    const channels = device.channels.map((channel) => ({
      externalId: channel.externalId,
      capability: channel.capability,
      value: channel.value,
    }));
    const failing = device.channels
      .map((channel) => controlErrors.get(`${device.externalId}/${channel.externalId}`))
      .filter((value): value is string => Boolean(value));
    const error = failing.length ? failing.join(",").slice(0, 80) : undefined;
    const key = JSON.stringify({ channels, error });
    if (!full && sentSnapshot.get(device.externalId) === key) continue;
    sentSnapshot.set(device.externalId, key);
    items.push({ externalId: device.externalId, channels, observedAt, ...(error ? { error } : {}) });
  }
  if (full) lastFullSnapshot = now;
  for (let index = 0; index < items.length; index += 200) {
    await call("states", { items: items.slice(index, index + 200) }).catch(() => undefined);
  }
}

function onMqttMessage(topic: string, payload: Buffer) {
  const value = parseMqttPayload(payload);
  const failing = parseWirenboardErrorTopic(topic);
  if (failing) {
    const key = `${failing.externalId}/${failing.control}`;
    const text = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
    if (text) controlErrors.set(key, text);
    else controlErrors.delete(key);
    return;
  }
  cache.ingest(topic, value);
  const parsed = parseWirenboardControlTopic(topic);
  if (!parsed) return;
  const device = runtime.pack().devices.find((item) => item.externalId === parsed.externalId);
  if (!device) return;
  const meta = controlCapability(parsed.control);
  runtime.ingestChannels(device.id, [{ capability: meta?.capability ?? null, value: normalizeChannelValue(meta?.capability, readControlValue(value)) }]);
  void queueEvaluate("event");
}

function scenarioSteps(value: unknown): ApplyCommand[] {
  if (!value || typeof value !== "object") return [];
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  const mapped: ApplyCommand[] = [];
  for (const item of steps) {
    if (!item || typeof item !== "object") continue;
    const row = item as { deviceId?: unknown; command?: unknown; value?: unknown; externalId?: unknown; endpoint?: unknown; adapter?: unknown; kind?: unknown };
    if (typeof row.deviceId !== "string" || typeof row.command !== "string") continue;
    mapped.push({
      id: "",
      deviceId: row.deviceId,
      command: row.command,
      value: row.value,
      externalId: typeof row.externalId === "string" ? row.externalId : null,
      endpoint: typeof row.endpoint === "string" ? row.endpoint : null,
      adapter: typeof row.adapter === "string" ? row.adapter : "wirenboard",
      kind: typeof row.kind === "string" ? row.kind : (runtime.pack().devices.find((device) => device.id === row.deviceId)?.kind ?? null),
    });
  }
  return mapped;
}

async function applyRunScenario(command: ApplyCommand): Promise<ApplyResult> {
  const value = command.value && typeof command.value === "object" ? (command.value as { scenarioId?: unknown; skipHigh?: unknown }) : {};
  const scenarioId = typeof value.scenarioId === "string" ? value.scenarioId : command.deviceId;
  const skipHigh = value.skipHigh === true;
  const steps = scenarioSteps(command.value).filter((step) => !(skipHigh && isHighStep(step.command, step.kind ?? "")));
  if (!steps.length) return { confirmed: false, error: "no-steps" };
  let confirmed = true;
  let sent = false;
  for (const [index, step] of steps.entries()) {
    const result = await applyHardware({ ...step, id: `${command.id}:${index}`, expiresAt: command.expiresAt ?? null });
    if (result.sent) sent = true;
    if (!result.confirmed) confirmed = false;
  }
  const at = new Date().toISOString();
  await reportAutomations([{ runId: `manual:${scenarioId}:${command.id}`, scenarioId, confirmed, at }]);
  return { confirmed, sent, ...(confirmed ? {} : { error: "scenario-partial" }) };
}

function cameraCommand(command: ApplyCommand): ApplyCommand {
  const value = command.value && typeof command.value === "object" ? (command.value as Record<string, unknown>) : {};
  const deviceId = typeof value.deviceId === "string" ? value.deviceId : command.deviceId;
  const media = cameras.get(deviceId);
  return media ? { ...command, value: { ...media, ...value } } : command;
}

async function applyOne(command: ApplyCommand): Promise<ApplyResult> {
  if (commandExpired(command)) return { confirmed: false, error: "expired" };
  if (command.command === "runScenario") {
    return applied.run(command.id, () => applyRunScenario(command));
  }
  if (command.command === "captureFrame") {
    return applied.run(command.id, () => captureCameraFrame(cameraCommand(command)));
  }
  return applyHardware(command);
}

function needsMqtt(): boolean {
  return runtime.pack().devices.some((device) => device.adapter === "wirenboard" || device.adapter === "mqtt");
}

function connectionStatus(): { status: "ONLINE" | "DEGRADED" | "CONNECTING" | "ERROR" | "OFFLINE"; lastError: string | null } {
  if (!mqttSession) {
    if (agentMode() === "live" && needsMqtt()) return { status: "DEGRADED", lastError: "mqtt-not-configured" };
    return { status: "ONLINE", lastError: null };
  }
  if (mqttSession.connected()) return { status: "ONLINE", lastError: null };
  if (mqttSession.reconnecting()) return { status: "CONNECTING", lastError: mqttSession.lastError() ?? "mqtt-reconnect" };
  return { status: "ERROR", lastError: mqttSession.lastError() };
}

function mqttState(): "up" | "down" | "none" {
  if (!mqttSession) return "none";
  return mqttSession.connected() ? "up" : "down";
}

async function cycle() {
  await buffer.flush((kind, extra) => send(kind, extra)).catch(() => undefined);
  const link = connectionStatus();
  await send("heartbeat", {
    status: link.status,
    version: agentVersion,
    lastError: link.lastError,
    bufferLag: buffer.size(),
    mqtt: mqttState(),
    mode: agentMode(),
  }).catch(() => undefined);
  await publishSnapshot();
  const pulled = await send("pull");
  if (pulled.automations) {
    runtime.load(pulled.automations);
    writePack(runtime.pack());
  }
  if (Array.isArray(pulled.cameras)) {
    cameras = new Map(
      pulled.cameras.filter((item) => typeof item?.deviceId === "string").map((item) => [item.deviceId as string, item]),
    );
  }
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
    await call("ack", ack).catch(() => undefined);
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await cycle();
  } finally {
    ticking = false;
  }
}

function startMqtt() {
  const url = process.env.STAR_HOME_WB_MQTT_URL;
  if (!url?.trim()) return;
  mqttSession = connectLocalMqtt({
    url,
    username: process.env.STAR_HOME_WB_MQTT_USER,
    password: process.env.STAR_HOME_WB_MQTT_PASSWORD,
    clientId: `star-home-gw-${createHash("sha256").update(token || `anon-${process.pid}`).digest("hex").slice(0, 12)}`,
    onMessage: onMqttMessage,
  });
}

async function main() {
  startMqtt();
  await tick().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
  });
  if (process.argv.includes("--once")) {
    await mqttSession?.disconnect();
    return;
  }
  setInterval(() => {
    void queueEvaluate("schedule");
  }, scheduleEveryMs);
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
