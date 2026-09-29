import { randomBytes } from "crypto";
import { formatLastContact } from "@/lib/format";
import { deriveLifecycle, markChannelsStale } from "@/server/device-channels";
import type { Device, Gateway } from "@/server/ops-store";

export const gatewayStaleMs = 90_000;
const exchangeKeep = 200;

export type GatewayExchangeKind = "heartbeat" | "pull" | "ack" | "state";

export type GatewayExchange = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  gatewayId: string;
  at: string;
  kind: GatewayExchangeKind;
  result: "ok" | "error";
  detail: string;
};

export function isGatewayStale(gateway: Pick<Gateway, "adapter" | "status" | "lastSeen">, now = Date.now()): boolean {
  if (gateway.adapter === "local") return false;
  if (gateway.status === "OFFLINE") return true;
  if (!gateway.lastSeen) return true;
  const seen = Date.parse(gateway.lastSeen);
  return !Number.isFinite(seen) || now - seen > gatewayStaleMs;
}

export function gatewayDisplayStatus(gateway: Pick<Gateway, "adapter" | "status" | "lastSeen">, now = Date.now()): string {
  if (gateway.adapter === "local") return gateway.status === "OFFLINE" ? "OFFLINE" : "ONLINE";
  if (!gateway.lastSeen) return "UNKNOWN";
  if (isGatewayStale(gateway, now)) return "OFFLINE";
  return gateway.status === "CONNECTING"
    ? "CONNECTING"
    : gateway.status === "ERROR"
      ? "ERROR"
      : gateway.status === "DEGRADED"
        ? "DEGRADED"
        : gateway.status === "OFFLINE"
          ? "OFFLINE"
          : "ONLINE";
}

export { gatewayStatusLabel } from "@/lib/format";

export function touchGatewayContact(gateway: Gateway, at = new Date().toISOString()): void {
  gateway.lastSeen = at;
}

export function expireStaleGateways(
  file: { gateways: Gateway[]; devices: Device[] },
  now = Date.now(),
): boolean {
  let changed = false;
  for (const gateway of file.gateways) {
    if (gateway.adapter === "local" || gateway.status === "OFFLINE") continue;
    if (!gateway.lastSeen) continue;
    const seen = Date.parse(gateway.lastSeen);
    if (!Number.isFinite(seen) || now - seen <= gatewayStaleMs) continue;
    gateway.status = "OFFLINE";
    gateway.lastError = gateway.lastError?.trim() ? gateway.lastError : "heartbeat-stale";
    changed = true;
    for (const device of file.devices.filter((item) => item.gatewayId === gateway.id)) {
      device.availability = "OFFLINE";
      markChannelsStale(device);
      device.status = deriveLifecycle(device);
    }
  }
  return changed;
}

export function recordGatewayExchange(
  file: { gatewayExchanges: GatewayExchange[] },
  input: Omit<GatewayExchange, "id" | "at"> & { at?: string },
): GatewayExchange {
  file.gatewayExchanges ??= [];
  const row: GatewayExchange = {
    id: `glog_${randomBytes(8).toString("hex")}`,
    at: input.at ?? new Date().toISOString(),
    companyId: input.companyId,
    objectId: input.objectId,
    unitId: input.unitId,
    gatewayId: input.gatewayId,
    kind: input.kind,
    result: input.result,
    detail: input.detail.trim().slice(0, 200),
  };
  file.gatewayExchanges.unshift(row);
  file.gatewayExchanges = file.gatewayExchanges.slice(0, exchangeKeep);
  return row;
}

export function contactSummary(gateway: Pick<Gateway, "lastSeen" | "status" | "adapter">, now = Date.now()): string {
  return formatLastContact(gateway.lastSeen, now);
}
