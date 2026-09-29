/** Local MQTT broker URL. Cloud and browsers must not use this. */

export type BrokerCheck = { ok: true; url: string } | { ok: false; error: "broker-unconfigured" | "broker-forbidden" };

export function assertLocalMqttUrl(raw: string | undefined | null): BrokerCheck {
  const value = raw?.trim() ?? "";
  if (!value) return { ok: false, error: "broker-unconfigured" };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "broker-forbidden" };
  }
  const host = parsed.hostname.toLowerCase();
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!local) return { ok: false, error: "broker-forbidden" };
  if (parsed.protocol !== "mqtt:" && parsed.protocol !== "mqtts:" && parsed.protocol !== "tcp:") {
    return { ok: false, error: "broker-forbidden" };
  }
  return { ok: true, url: value };
}
