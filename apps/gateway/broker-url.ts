/** Site MQTT broker URL. Cloud and browsers must not use this. Public internet brokers are forbidden. */

export type BrokerCheck = { ok: true; url: string } | { ok: false; error: "broker-unconfigured" | "broker-forbidden" };

function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase();
  if (name === "127.0.0.1" || name === "localhost" || name === "::1") return true;
  if (name.endsWith(".local")) return true;
  const ipv4 = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 127) return true;
  return false;
}

export function assertLocalMqttUrl(raw: string | undefined | null): BrokerCheck {
  const value = raw?.trim() ?? "";
  if (!value) return { ok: false, error: "broker-unconfigured" };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "broker-forbidden" };
  }
  if (!isPrivateHost(parsed.hostname)) return { ok: false, error: "broker-forbidden" };
  if (parsed.protocol !== "mqtt:" && parsed.protocol !== "mqtts:" && parsed.protocol !== "tcp:") {
    return { ok: false, error: "broker-forbidden" };
  }
  return { ok: true, url: value };
}
