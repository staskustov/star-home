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
import { applyQueuedCommand, type ApplyCommand, type ApplyResult } from "./apply";
import { createCommandOnce } from "./command-once";
import { createOutboundBuffer, shouldBufferStatus, type OutboundItem } from "./outbound-buffer";
import { connectLocalMqtt, parseMqttPayload, type MqttSession } from "./mqtt-session";
import { createTopicCache } from "./topic-cache";
import { groupWirenboardControls, type WbTopicValue } from "./wb-controls";

export const agentVersion = "agent-5";

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
  cache.ingest(topic, parseMqttPayload(payload));
}

async function applyOne(command: ApplyCommand): Promise<ApplyResult> {
  return applied.run(command.id, () =>
    applyQueuedCommand(command, {
      echo,
      discover: discoverLocal,
      publishMqtt: mqttSession ? (topic, payload) => mqttSession!.publish(topic, payload) : undefined,
      readSeq: (topic) => cache.seq(topic),
      waitMqtt: (topic, match, timeoutMs, afterSeq, signal) => cache.waitFor(topic, match, timeoutMs, afterSeq, signal),
      commandTimeoutMs: Number.isFinite(commandTimeoutMs) ? commandTimeoutMs : 4_000,
      commandRetries: Number.isFinite(commandRetries) ? commandRetries : 2,
    }),
  );
}

function connectionStatus(): { status: "ONLINE" | "DEGRADED" | "OFFLINE"; lastError: string | null } {
  if (!mqttSession) return { status: "ONLINE", lastError: null };
  if (mqttSession.connected()) return { status: "ONLINE", lastError: null };
  if (mqttSession.reconnecting()) return { status: "DEGRADED", lastError: mqttSession.lastError() ?? "mqtt-reconnect" };
  return { status: "DEGRADED", lastError: mqttSession.lastError() };
}

async function tick() {
  const link = connectionStatus();
  await call("heartbeat", { status: link.status, version: agentVersion, lastError: link.lastError });
  await publishSnapshot();
  const pulled = await call("pull");
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
    await call("ack", ack);
  }
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

export { applyOne, discoverLocal, tick, cache, buffer };
