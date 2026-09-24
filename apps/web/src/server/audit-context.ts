import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@/types/domain";

export type ClientInfo = { ip: string | null; device: string | null };

type RequestContext = {
  client: ClientInfo;
  actor: { userId: string; role: Role; membershipId: string | null } | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

function clean(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, limit) : null;
}

export function clientInfo(value: unknown): ClientInfo {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return { ip: clean(raw.ip, 64), device: clean(raw.device, 80) };
}

export function withRequest<T>(client: ClientInfo, run: () => T): T {
  return storage.run({ client, actor: null }, run);
}

export function noteActor(actor: RequestContext["actor"]): void {
  const context = storage.getStore();
  if (context) context.actor = actor;
}

export function requestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}
