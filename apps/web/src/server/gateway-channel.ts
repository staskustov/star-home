import { createHash, randomBytes } from "crypto";
import { packAutomations, ingestAutomationRun, type GatewayAutomationPack } from "@/server/automation";
import { ingestCameraFrame, packCameras } from "@/server/camera-media";
import { settleProbeFromAck } from "@/server/device-commission";
import { completeDiscovery } from "@/server/device-discovery";
import { ackGatewayCommand, confirmCommandsFromState, pullGatewayCommands } from "@/server/gateway-queue";
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
  stateSliceForCapability,
} from "@/server/device-channels";
import { findGateway, readOps, recordChannelHistory, writeOps } from "@/server/ops-store";
import { expireStaleGateways, recordGatewayExchange, touchGatewayContact } from "@/server/gateway-contact";
import { can, managesGateway, objectFor, type StaffActor } from "@/server/rbac/decide";
import { notifyIfAlert } from "@/server/smart-notices";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function gatewayScoped(command: string): boolean {
  return command === "discover" || command === "runScenario";
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
  if (!managesGateway(actor, gateway)) return { ok: false, status: 403, message: "Нужен доступ ко всему объекту" };
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
  if (!managesGateway(actor, gateway)) return { ok: false, status: 403, message: "Нужен доступ ко всему объекту" };
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
    expiresAt: string | null;
    externalId: string | null;
    endpoint: string | null;
    adapter: string;
    kind: string | null;
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
  const pending = pullGatewayCommands(gateway.id);
  const moved = pending.filter((item) => {
    const device = latest.devices.find((row) => row.id === item.deviceId);
    return device ? device.gatewayId !== gateway.id : !gatewayScoped(item.command);
  });
  if (moved.length) {
    for (const item of moved) {
      const row = latest.gatewayCommands.find((entry) => entry.id === item.id);
      if (row) {
        row.status = "FAILED";
        row.error = "device-moved";
        row.ackedAt = new Date().toISOString();
      }
    }
    writeOps(latest);
  }
  const commands = pending
    .filter((item) => !moved.includes(item))
    .map((item) => {
      const device = latest.devices.find((row) => row.id === item.deviceId && row.gatewayId === gateway.id);
      return {
        id: item.id,
        deviceId: item.deviceId,
        command: item.command,
        value: item.value,
        expiresAt: item.expiresAt ?? null,
        externalId: device?.externalId ?? null,
        endpoint: device?.endpoint ?? null,
        adapter: device?.adapter ?? gateway.adapter,
        kind: device?.kind ?? null,
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

export async function gatewayChannel(token: string | null, body: Record<string, unknown> | null, pull = false): Promise<Result<unknown>> {
  if (pull) return pullGateway(token);
  const input = body ?? {};
  const kind = input.kind;
  if (kind === "states") {
    const items = Array.isArray(input.items) ? input.items.slice(0, 500) : [];
    const touched: string[] = [];
    let applied = 0;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const result = ingestGatewayState(token, item as Record<string, unknown>);
      if (!result.ok && result.status === 401) return result;
      if (result.ok) {
        applied += 1;
        touched.push(result.value.deviceId);
      }
    }
    await runDeviceEvents(touched);
    return { ok: true, value: { applied } };
  }
  if (kind === "state") {
    const result = ingestGatewayState(token, input);
    if (result.ok) await runDeviceEvents([result.value.deviceId]);
    return result;
  }
  if (kind === "pull") return pullGateway(token);
  if (kind === "ack") return ackGateway(token, input);
  if (kind === "automation") return ingestAutomation(token, input);
  if (kind === "camera") return ingestCamera(token, input);
  const beat = heartbeatGateway(token, input);
  if (beat.ok) {
    const gateway = gatewayByToken(token);
    if (gateway) await (await import("./scenarios")).runDueSchedules({ companyId: gateway.companyId, objectId: gateway.objectId });
  }
  return beat;
}

async function runDeviceEvents(deviceIds: string[]): Promise<void> {
  const { runEventScenarios } = await import("./scenarios");
  for (const id of [...new Set(deviceIds)]) await runEventScenarios(id);
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
  if (result.ok) {
    const row = readOps().gatewayCommands.find((item) => item.id === result.value.commandId);
    if (row) settleProbeFromAck(row.id, row.status);
  }
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
  input: { status?: unknown; version?: unknown; lastError?: unknown; bufferLag?: unknown; mqtt?: unknown; mode?: unknown },
): Result<{ status: string }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const file = readOps();
  expireStaleGateways(file);
  const current = file.gateways.find((item) => item.id === gateway.id);
  if (!current) return { ok: false, status: 404, message: "Шлюз не найден" };
  if (input.status === "ONLINE" || input.status === "OFFLINE" || input.status === "DEGRADED" || input.status === "CONNECTING" || input.status === "ERROR") {
    current.status = input.status;
  } else current.status = "ONLINE";
  if (typeof input.version === "string" && input.version.trim()) current.version = input.version.trim().slice(0, 40);
  current.lastSeen = new Date().toISOString();
  if (typeof input.lastError === "string") current.lastError = input.lastError.trim().slice(0, 200) || null;
  else if (input.lastError === null || current.status === "ONLINE") current.lastError = null;
  const lag = Number(input.bufferLag);
  current.bufferLag = Number.isFinite(lag) ? Math.max(0, Math.min(10_000, Math.round(lag))) : current.bufferLag ?? null;
  if (input.mqtt === "up" || input.mqtt === "down" || input.mqtt === "none") current.mqtt = input.mqtt;
  if (current.mqtt === "down" && current.status === "ONLINE") current.status = "DEGRADED";
  const mode = input.mode === "echo" || input.mode === "simulator" ? input.mode : "live";
  if (current.mode !== mode) current.mode = mode;
  const now = Date.now();
  const dropped: typeof file.devices = [];
  for (const device of file.devices.filter((item) => item.gatewayId === current.id)) {
    const was = device.availability;
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
    if (mode !== "live") device.metadata = { ...device.metadata, source: "MOCK" };
    else if (device.metadata?.source === "MOCK" && device.adapter !== "simulator") {
      const { source: _source, ...rest } = device.metadata;
      device.metadata = rest;
    }
    if (device.availability === "OFFLINE" && was !== "OFFLINE") dropped.push(device);
    device.status = deriveLifecycle(device);
  }
  recordGatewayExchange(file, {
    companyId: current.companyId,
    objectId: current.objectId,
    unitId: current.unitId,
    gatewayId: current.id,
    kind: "heartbeat",
    result: current.status === "OFFLINE" ? "error" : "ok",
    detail: [current.status, current.version, current.mqtt, current.bufferLag != null ? `buf ${current.bufferLag}` : "", current.lastError]
      .filter((part) => part !== "" && part != null)
      .join(" "),
  });
  writeOps(file);
  for (const device of dropped) {
    notifyIfAlert({
      companyId: device.companyId,
      objectId: device.objectId,
      unitId: device.unitId,
      name: device.name,
      kind: device.kind,
      before: { availability: "ONLINE" },
      after: { availability: "OFFLINE" },
    });
  }
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
  input: {
    deviceId?: unknown;
    externalId?: unknown;
    topic?: unknown;
    state?: unknown;
    channels?: unknown;
    value?: unknown;
    observedAt?: unknown;
    error?: unknown;
  },
): Result<{ applied: boolean; deviceId: string }> {
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
  const faulted = input.error === true || (typeof input.error === "string" && Boolean(input.error.trim()));
  if (!faulted && !Object.keys(next).length && !incoming.length) return { ok: false, status: 400, message: "Нет состояния" };
  const current = file.devices.find((item) => item.id === device.id);
  if (!current) return { ok: false, status: 404, message: "Устройство не найдено" };
  const before = { work: current.work, detected: current.state?.detected, availability: current.availability };
  const now = Date.now();
  const reported = typeof input.observedAt === "string" ? Date.parse(input.observedAt) : NaN;
  const observedAt = new Date(Number.isFinite(reported) && reported <= now && now - reported < 10 * 60_000 ? reported : now).toISOString();
  if (faulted) {
    current.availability = "OFFLINE";
    if (current.work !== "FAULT") {
      current.work = "FAULT";
      current.metadata = { ...current.metadata, faultFromGateway: true };
    }
    markChannelsStale(current);
    current.status = deriveLifecycle(current);
    writeOps(file);
    notifyIfAlert({
      companyId: current.companyId,
      objectId: current.objectId,
      unitId: current.unitId,
      name: current.name,
      kind: current.kind,
      before,
      after: { work: current.work, detected: current.state?.detected, availability: current.availability },
    });
    emitLive({ objectId: current.objectId, kind: "device", title: `${current.name}: ошибка`, deviceId: current.id, gatewayId: gateway.id });
    return { ok: true, value: { applied: true, deviceId: current.id } };
  }
  current.lastSeen = observedAt;
  current.availability = "ONLINE";
  if (current.work === "FAULT" && current.metadata?.faultFromGateway === true) {
    current.work = "ON";
    current.metadata = { ...current.metadata, faultFromGateway: false };
  }
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
  const observed = fromChannels.reduce<Record<string, unknown>>(
    (acc, capability) => ({ ...acc, ...stateSliceForCapability(capability, current.state) }),
    { ...next },
  );
  confirmCommandsFromState(file, current.id, observed, observedAt);
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
    kind: current.kind,
    before,
    after: { work: current.work, detected: current.state?.detected, availability: current.availability },
  });
  emitLive({ objectId: current.objectId, kind: "device", title: `${current.name}: состояние`, deviceId: current.id, gatewayId: gateway.id });
  return { ok: true, value: { applied: true, deviceId: current.id } };
}
