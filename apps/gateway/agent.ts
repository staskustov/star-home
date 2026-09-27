/**
 * STAR HOME Local Gateway agent.
 * Runs on the object LAN. Does not open controller MQTT to the internet.
 * Confirms nothing it did not actually apply.
 *
 *   STAR_HOME_CLOUD_URL=http://127.0.0.1:3456 \
 *   STAR_HOME_GATEWAY_TOKEN=... \
 *   STAR_HOME_WB_DISCOVERY=./wb-discovery.json \
 *   npx tsx apps/gateway/agent.ts
 */

import { readFileSync } from "fs";
import { groupWirenboardControls, type WbTopicValue } from "./wb-controls";

const cloud = (process.env.STAR_HOME_CLOUD_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");
const token = process.env.STAR_HOME_GATEWAY_TOKEN ?? "";
const intervalMs = Number(process.env.STAR_HOME_GATEWAY_INTERVAL_MS ?? 20_000);

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

async function call(kind: string, extra: Record<string, unknown> = {}) {
  if (!token) throw new Error("STAR_HOME_GATEWAY_TOKEN is required");
  const response = await fetch(`${cloud}/api/smart-home/gateways/channel`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-star-home-gateway": token },
    body: JSON.stringify({ kind, ...extra }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    commands?: { id: string; deviceId: string; command: string; value?: unknown }[];
  };
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

function discoverLocal() {
  const snapshot = loadDiscoverySnapshot();
  if (!snapshot) return { confirmed: false as const, error: "no-discovery-source" };
  return { confirmed: true as const, devices: groupWirenboardControls(snapshot) };
}

async function publishSnapshot() {
  const found = discoverLocal();
  if (!found.confirmed) return;
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

async function tick() {
  await call("heartbeat", { status: "ONLINE", version: "agent-1" });
  await publishSnapshot();
  const pulled = await call("pull");
  for (const command of pulled.commands ?? []) {
    if (command.command === "discover") {
      const found = discoverLocal();
      await call("ack", { commandId: command.id, ...found });
      continue;
    }
    await call("ack", { commandId: command.id, confirmed: false, error: "agent-unapplied" });
  }
}

async function main() {
  await tick();
  if (process.argv.includes("--once")) return;
  setInterval(() => {
    void tick().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, Number.isFinite(intervalMs) ? Math.max(5_000, intervalMs) : 20_000);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
