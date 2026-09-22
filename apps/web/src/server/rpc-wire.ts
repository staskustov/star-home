import { createHmac } from "crypto";
import type { SessionRef } from "@/server/actor";

const secret = () => process.env.STAR_HOME_INTERNAL_SECRET ?? "star-home-dev-internal";
const endpoint = () => process.env.STAR_HOME_API_URL ?? "http://127.0.0.1:3457";

export async function rpcWith<T = unknown>(session: SessionRef | null, method: string, input?: unknown): Promise<{ status: number; body: T }> {
  const payload = JSON.stringify({ method, input: input ?? null, session });
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  const response = await fetch(`${endpoint()}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-star-home-signature": signature },
    body: payload,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({ message: "Не удалось подтвердить выполнение." }))) as T;
  return { status: response.status, body };
}
