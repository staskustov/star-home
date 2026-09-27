import { createHash, randomBytes } from "crypto";
import { completeDiscovery } from "@/server/device-discovery";
import { ackGatewayCommand, pullGatewayCommands } from "@/server/gateway-queue";
import { emitLive } from "@/server/live-bus";
import { mapWirenboardControl } from "@/server/adapters/wirenboard-controls";
import {
  applyIngestedChannels,
  applyStateToChannels,
  capabilitiesTouchedByState,
  deriveLifecycle,
  markChannelsStale,
  persistChannels,
  pickNormalizedState,
  refreshChannelFreshness,
} from "@/server/device-channels";
import { findGateway, readOps, recordChannelHistory, writeOps } from "@/server/ops-store";
import { can, objectFor, type StaffActor } from "@/server/rbac/decide";
import { notifyIfAlert } from "@/server/smart-notices";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function gatewayByToken(token: string | null) {
  if (!token) return undefined;
  const hash = digest(token);
  return readOps().gateways.find((item) => item.tokenHash === hash);
}

export function pairGateway(actor: StaffActor, gatewayId: unknown): Result<{ token: string; gatewayId: string }> {
  if (!can(actor, "devices.edit")) return { ok: false, status: 403, message: "Нет доступа" };
  if (typeof gatewayId !== "string" || !gatewayId) return { ok: false, status: 400, message: "Шлюз не найден" };
  const gateway = findGateway(gatewayId);
  if (!gateway || gateway.companyId !== actor.companyId) return { ok: false, status: 404, message: "Шлюз не найден" };
  const owned = objectFor(actor, gateway.objectId);
  if (!owned.ok) return owned;
  const token = randomBytes(24).toString("hex");
  const file = readOps();
  const current = file.gateways.find((item) => item.id === gateway.id);
  if (!current) return { ok: false, status: 404, message: "Шлюз не найден" };
  current.tokenHash = digest(token);
  current.pairedAt = new Date().toISOString();
  current.lastError = null;
  writeOps(file);
  return { ok: true, value: { token, gatewayId: current.id } };
}

export function rotateGateway(actor: StaffActor, gatewayId: unknown): Result<{ token: string; gatewayId: string }> {
  return pairGateway(actor, gatewayId);
}

export function revokeGateway(actor: StaffActor, gatewayId: unknown): Result<{ gatewayId: string }> {
  if (!can(actor, "devices.edit")) return { ok: false, status: 403, message: "Нет доступа" };
  if (typeof gatewayId !== "string" || !gatewayId) return { ok: false, status: 400, message: "Шлюз не найден" };
  const gateway = findGateway(gatewayId);
  if (!gateway || gateway.companyId !== actor.companyId) return { ok: false, status: 404, message: "Шлюз не найден" };
  const owned = objectFor(actor, gateway.objectId);
  if (!owned.ok) return owned;
  const file = readOps();
  const current = file.gateways.find((item) => item.id === gateway.id);
  if (!current) return { ok: false, status: 404, message: "Шлюз не найден" };
  current.tokenHash = null;
  current.pairedAt = null;
  current.status = current.adapter === "local" ? current.status : "OFFLINE";
  writeOps(file);
  return { ok: true, value: { gatewayId: current.id } };
}

export function pullGateway(token: string | null): Result<{ commands: { id: string; deviceId: string; command: string; value: unknown }[] }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  return {
    ok: true,
    value: {
      commands: pullGatewayCommands(gateway.id).map((item) => ({
        id: item.id,
        deviceId: item.deviceId,
        command: item.command,
        value: item.value,
      })),
    },
  };
}

export function ackGateway(
  token: string | null,
  input: { commandId?: unknown; confirmed?: unknown; state?: unknown; devices?: unknown; error?: unknown },
): Result<{ commandId: string; applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const result = ackGatewayCommand(gateway.id, input);
  if (result.ok) completeDiscovery(gateway.id, typeof input.commandId === "string" ? input.commandId : "", input);
  return result;
}

export function heartbeatGateway(token: string | null, input: { status?: unknown; version?: unknown }): Result<{ status: string }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const file = readOps();
  const current = file.gateways.find((item) => item.id === gateway.id);
  if (!current) return { ok: false, status: 404, message: "Шлюз не найден" };
  if (input.status === "ONLINE" || input.status === "OFFLINE" || input.status === "DEGRADED") current.status = input.status;
  else current.status = "ONLINE";
  if (typeof input.version === "string" && input.version.trim()) current.version = input.version.trim().slice(0, 40);
  current.lastSeen = new Date().toISOString();
  current.lastError = null;
  const now = Date.now();
  for (const device of file.devices.filter((item) => item.gatewayId === current.id)) {
    if (current.status === "OFFLINE") {
      device.availability = "OFFLINE";
      markChannelsStale(device);
    } else {
      refreshChannelFreshness(device, now);
      if (device.lastSeen) {
        const seen = Date.parse(device.lastSeen);
        if (!Number.isFinite(seen) || now - seen > 5 * 60_000) device.availability = "OFFLINE";
      }
    }
    device.status = deriveLifecycle(device);
  }
  writeOps(file);
  emitLive({
    objectId: current.objectId,
    kind: "gateway",
    title: current.status === "OFFLINE" ? `${current.name}: нет связи` : `${current.name}: на связи`,
    gatewayId: current.id,
  });
  return { ok: true, value: { status: current.status } };
}

export function ingestGatewayState(
  token: string | null,
  input: { deviceId?: unknown; externalId?: unknown; topic?: unknown; state?: unknown; channels?: unknown; value?: unknown },
): Result<{ applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const file = readOps();
  const fromTopic = typeof input.topic === "string" ? mapWirenboardControl(input.topic, input.value ?? input.state) : null;
  const device =
    typeof input.deviceId === "string"
      ? file.devices.find((item) => item.id === input.deviceId && item.gatewayId === gateway.id)
      : typeof input.externalId === "string"
        ? file.devices.find((item) => item.externalId === input.externalId && item.gatewayId === gateway.id)
        : fromTopic
          ? file.devices.find((item) => item.externalId === fromTopic.externalId && item.gatewayId === gateway.id)
          : undefined;
  if (!device || device.companyId !== gateway.companyId) return { ok: false, status: 404, message: "Устройство не найдено" };
  const next = pickNormalizedState(input.state);
  const incoming = [
    ...(Array.isArray(input.channels) ? input.channels : []),
    ...(fromTopic ? [fromTopic.channel] : []),
  ].filter((item): item is { capability?: string | null; externalId?: string; name?: string; value?: unknown } => Boolean(item) && typeof item === "object");
  if (!Object.keys(next).length && !incoming.length) return { ok: false, status: 400, message: "Нет состояния" };
  const current = file.devices.find((item) => item.id === device.id);
  if (!current) return { ok: false, status: 404, message: "Устройство не найдено" };
  const before = { work: current.work, detected: current.state?.detected };
  current.lastSeen = new Date().toISOString();
  current.availability = "ONLINE";
  if (!current.channels?.length) persistChannels(current);
  const fromChannels = incoming.length ? applyIngestedChannels(current, incoming, current.lastSeen) : [];
  if (Object.keys(next).length) {
    current.state = { ...current.state, ...next };
    if (next.latch) current.latch = next.latch;
    applyStateToChannels(current);
  }
  current.status = deriveLifecycle(current);
  const touched = [...fromChannels, ...capabilitiesTouchedByState(next)];
  recordChannelHistory(file, {
    deviceId: current.id,
    objectId: current.objectId,
    at: current.lastSeen,
    state: current.state ?? next,
    capabilities: touched,
  });
  writeOps(file);
  notifyIfAlert({
    companyId: current.companyId,
    objectId: current.objectId,
    unitId: current.unitId,
    name: current.name,
    before,
    after: { work: current.work, detected: current.state?.detected },
  });
  emitLive({ objectId: current.objectId, kind: "device", title: `${current.name}: состояние`, deviceId: current.id, gatewayId: gateway.id });
  return { ok: true, value: { applied: true } };
}
