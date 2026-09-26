/**
 * STAR HOME Local Gateway agent.
 * Runs on the object LAN. Does not open controller MQTT to the internet.
 * Confirms nothing it did not actually apply.
 *
 *   STAR_HOME_CLOUD_URL=http://127.0.0.1:3456 \
 *   STAR_HOME_GATEWAY_TOKEN=... \
 *   npx tsx apps/gateway/agent.ts
 */

const cloud = (process.env.STAR_HOME_CLOUD_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");
const token = process.env.STAR_HOME_GATEWAY_TOKEN ?? "";
const intervalMs = Number(process.env.STAR_HOME_GATEWAY_INTERVAL_MS ?? 20_000);

async function call(kind: string, extra: Record<string, unknown> = {}) {
  if (!token) throw new Error("STAR_HOME_GATEWAY_TOKEN is required");
  const response = await fetch(`${cloud}/api/smart-home/gateways/channel`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-star-home-gateway": token },
    body: JSON.stringify({ kind, ...extra }),
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string; commands?: { id: string; deviceId: string; command: string }[] };
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

async function tick() {
  await call("heartbeat", { status: "ONLINE", version: "agent-1" });
  const pulled = await call("pull");
  for (const command of pulled.commands ?? []) {
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
