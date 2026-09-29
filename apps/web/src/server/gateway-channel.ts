import { createHash, randomBytes } from "crypto";
import { packAutomations, ingestAutomationRun, type GatewayAutomationPack } from "@/server/automation";
import { ingestCameraFrame, packCameras } from "@/server/camera-media";
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
import { expireStaleGateways, recordGatewayExchange, touchGatewayContact } from "@/server/gateway-contact";
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

export function pullGateway(token: string | null): Result<{
  commands: {
    id: string;
    deviceId: string;
    command: string;
    value: unknown;
    externalId: string | null;
    endpoint: string | null;
    adapter: string;
  }[];
  automations: GatewayAutomationPack;
  cameras: ReturnType<typeof packCameras>;
}> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const file = readOps();
  expireStaleGateways(file);
  const current = file.gateways.find((item) => item.id === gateway.id);
  if (current) touchGatewayContact(current);
  writeOps(file);
  const latest = readOps();
  const commands = pullGatewayCommands(gateway.id).map((item) => {
    const device = latest.devices.find((row) => row.id === item.deviceId);
    return {
      id: item.id,
      deviceId: item.deviceId,
      command: item.command,
      value: item.value,
      externalId: device?.externalId ?? null,
      endpoint: device?.endpoint ?? null,
      adapter: device?.adapter ?? gateway.adapter,
    };
  });
  const logged = readOps();
  const hub = logged.gateways.find((item) => item.id === gateway.id);
  if (hub) {
    recordGatewayExchange(logged, {
      companyId: hub.companyId,
      objectId: hub.objectId,
      unitId: hub.unitId,
      gatewayId: hub.id,
      kind: "pull",
      result: "ok",
      detail: commands.length ? `pull ${commands.length}` : "pull",
    });
    writeOps(logged);
  }
  return { ok: true, value: { commands, automations: packAutomations(gateway.id), cameras: packCameras(gateway.id) } };
}

export function ingestCamera(
  token: string | null,
  input: { deviceId?: unknown; jpeg?: unknown; frame?: unknown; at?: unknown },
): Result<{ applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  return { ok: true, value: ingestCameraFrame(gateway.id, input) };
}

export function ingestAutomation(
  token: string | null,
  input: { runId?: unknown; scenarioId?: unknown; ruleId?: unknown; confirmed?: unknown; at?: unknown },
): Result<{ applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  return { ok: true, value: ingestAutomationRun(gateway.id, input) };
}

export function ackGateway(
  token: string | null,
  input: { commandId?: unknown; confirmed?: unknown; sent?: unknown; state?: unknown; devices?: unknown; error?: unknown; frame?: unknown; jpeg?: unknown },
): Result<{ commandId: string; applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const result = ackGatewayCommand(gateway.id, input);
  if (result.ok) completeDiscovery(gateway.id, typeof input.commandId === "string" ? input.commandId : "", input);
  if (result.ok && (input.frame || input.jpeg)) {
    const row = readOps().gatewayCommands.find((item) => item.id === result.value.commandId);
    if (row?.command === "captureFrame") {
      ingestCameraFrame(gateway.id, { deviceId: row.deviceId, jpeg: input.jpeg ?? input.frame });
    }
  }
  if (result.ok) {
    const file = readOps();
    expireStaleGateways(file);
    const current = file.gateways.find((item) => item.id === gateway.id);
    if (current) {
      touchGatewayContact(current);
      const row = file.gatewayCommands.find((item) => item.id === result.value.commandId);
      const failed = row?.status === "FAILED" || row?.status === "EXPIRED";
      recordGatewayExchange(file, {
        companyId: current.companyId,
        objectId: current.objectId,
        unitId: current.unitId,
        gatewayId: current.id,
        kind: "ack",
        result: failed ? "error" : "ok",
        detail: [`ack`, row?.status, row?.command, typeof input.error === "string" ? input.error : ""]
          .filter((part) => part && String(part).trim())
          .join(" "),
      });
    }
    writeOps(file);
  }
  return result;
}

export function heartbeatGateway(
  token: string | null,
  input: { status?: unknown; version?: unknown; lastError?: unknown },
): Result<{ status: string }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const file = readOps();
  expireStaleGateways(file);
  const current = file.gateways.find((item) => item.id === gateway.id);
  if (!current) return { ok: false, status: 404, message: "Шлюз не найден" };
  if (input.status === "ONLINE" || input.status === "OFFLINE" || input.status === "DEGRADED") current.status = input.status;
  else current.status = "ONLINE";
  if (typeof input.version === "string" && input.version.trim()) current.version = input.version.trim().slice(0, 40);
  current.lastSeen = new Date().toISOString();
  if (typeof input.lastError === "string") current.lastError = input.lastError.trim().slice(0, 200) || null;
  else if (input.lastError === null || current.status === "ONLINE") current.lastError = null;
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
  recordGatewayExchange(file, {
    companyId: current.companyId,
    objectId: current.objectId,
    unitId: current.unitId,
    gatewayId: current.id,
    kind: "heartbeat",
    result: current.status === "OFFLINE" ? "error" : "ok",
    detail: [current.status, current.version, current.lastError].filter(Boolean).join(" "),
  });
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
  expireStaleGateways(file);
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
  const hub = file.gateways.find((item) => item.id === gateway.id);
  if (hub) {
    touchGatewayContact(hub);
    recordGatewayExchange(file, {
      companyId: hub.companyId,
      objectId: hub.objectId,
      unitId: hub.unitId,
      gatewayId: hub.id,
      kind: "state",
      result: "ok",
      detail: `state ${current.externalId ?? current.name}`,
    });
  }
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
