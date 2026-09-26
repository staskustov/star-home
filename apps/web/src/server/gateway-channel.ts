import { createHash, randomBytes } from "crypto";
import { ackGatewayCommand, pullGatewayCommands } from "@/server/gateway-queue";
import { emitLive } from "@/server/live-bus";
import { findGateway, readOps, recordSmartHistory, writeOps, type NormalizedState } from "@/server/ops-store";
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

export function ackGateway(token: string | null, input: { commandId?: unknown; confirmed?: unknown; state?: unknown }): Result<{ commandId: string; applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  return ackGatewayCommand(gateway.id, input);
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
  writeOps(file);
  emitLive({ objectId: current.objectId, kind: "gateway", title: `${current.name}: на связи`, gatewayId: current.id });
  return { ok: true, value: { status: current.status } };
}

export function ingestGatewayState(
  token: string | null,
  input: { deviceId?: unknown; externalId?: unknown; topic?: unknown; state?: unknown },
): Result<{ applied: boolean }> {
  const gateway = gatewayByToken(token);
  if (!gateway) return { ok: false, status: 401, message: "Нет доступа" };
  const file = readOps();
  const device =
    typeof input.deviceId === "string"
      ? file.devices.find((item) => item.id === input.deviceId && item.gatewayId === gateway.id)
      : typeof input.externalId === "string"
        ? file.devices.find((item) => item.externalId === input.externalId && item.gatewayId === gateway.id)
        : undefined;
  if (!device || device.companyId !== gateway.companyId) return { ok: false, status: 404, message: "Устройство не найдено" };
  const raw = input.state && typeof input.state === "object" && !Array.isArray(input.state) ? (input.state as NormalizedState) : null;
  if (!raw) return { ok: false, status: 400, message: "Нет состояния" };
  const next: NormalizedState = {};
  if (typeof raw.on === "boolean") next.on = raw.on;
  if (typeof raw.brightness === "number" && Number.isFinite(raw.brightness)) next.brightness = raw.brightness;
  if (typeof raw.temperatureC === "number" && Number.isFinite(raw.temperatureC)) next.temperatureC = raw.temperatureC;
  if (typeof raw.humidityPercent === "number" && Number.isFinite(raw.humidityPercent)) next.humidityPercent = raw.humidityPercent;
  if (typeof raw.targetC === "number" && Number.isFinite(raw.targetC)) next.targetC = raw.targetC;
  if (typeof raw.mode === "string") next.mode = raw.mode;
  if (typeof raw.position === "number" && Number.isFinite(raw.position)) next.position = raw.position;
  if (raw.latch === "OPEN" || raw.latch === "CLOSED") next.latch = raw.latch;
  if (typeof raw.detected === "boolean") next.detected = raw.detected;
  if (typeof raw.watts === "number" && Number.isFinite(raw.watts)) next.watts = raw.watts;
  if (typeof raw.kwh === "number" && Number.isFinite(raw.kwh)) next.kwh = raw.kwh;
  if (!Object.keys(next).length) return { ok: false, status: 400, message: "Нет состояния" };
  const current = file.devices.find((item) => item.id === device.id);
  if (!current) return { ok: false, status: 404, message: "Устройство не найдено" };
  const before = { work: current.work, detected: current.state?.detected };
  current.state = { ...current.state, ...next };
  if (next.latch) current.latch = next.latch;
  current.lastSeen = new Date().toISOString();
  current.availability = "ONLINE";
  recordSmartHistory(file, { deviceId: current.id, objectId: current.objectId, at: current.lastSeen, state: next });
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
