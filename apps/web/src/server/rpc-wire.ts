import { createHmac } from "crypto";
import type { SessionRef } from "@/server/actor";
import type { ClientInfo } from "@/server/audit-context";
import { internalSecret } from "@/server/internal-secret";

const endpoint = () => process.env.STAR_HOME_API_URL ?? "http://127.0.0.1:3457";

const browsers: [RegExp, string][] = [
  [/YaBrowser\//, "Яндекс Браузер"],
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const systems: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

function deviceOf(agent: string | null): string | null {
  if (!agent) return null;
  const browser = browsers.find(([pattern]) => pattern.test(agent))?.[1];
  const system = systems.find(([pattern]) => pattern.test(agent))?.[1];
  const label = [browser, system].filter(Boolean).join(" · ");
  return label || agent.slice(0, 60);
}

export function clientFrom(headers: Headers): ClientInfo {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || headers.get("x-real-ip") || null, device: deviceOf(headers.get("user-agent")) };
}

export async function rpcWith<T = unknown>(
  session: SessionRef | null,
  method: string,
  input?: unknown,
  client?: ClientInfo,
): Promise<{ status: number; body: T }> {
  const payload = JSON.stringify({ method, input: input ?? null, session, client: client ?? null, at: Date.now() });
  const signature = createHmac("sha256", internalSecret()).update(payload).digest("hex");
  const response = await fetch(`${endpoint()}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-star-home-signature": signature },
    body: payload,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({ message: "Не удалось подтвердить выполнение." }))) as T;
  return { status: response.status, body };
}
