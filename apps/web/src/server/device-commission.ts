import { deriveLifecycle } from "@/server/device-channels";
import { deviceFor } from "@/server/device-registry";
import { recordAudit } from "@/server/operations";
import { readOps, writeOps, type Device } from "@/server/ops-store";
import { can, type StaffActor } from "@/server/rbac/decide";
import { commandDeviceSmart } from "@/server/smart-home";
import { commandRisk, deviceCan, smartCommands, type SmartCommandName } from "@/server/smart-commands";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

export type ProbeResult = "confirmed" | "failed";

export type ProbeView = {
  confirmed: boolean;
  elapsedMs: number;
  message: string;
  status: "confirmed" | "failed";
  commandId?: string;
  lastProbeAt: string;
  lastProbeMs: number;
  lastProbeResult: ProbeResult;
};

export type HandoverView = {
  id: string;
  handedOver: boolean;
};

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };
const pollMs = 40;

function riskRank(command: SmartCommandName, device: Device): number {
  const risk = commandRisk(command, device);
  if (risk === "LOW") return 0;
  if (risk === "MEDIUM") return 1;
  return 2;
}

export function probeTimeoutMs(): number {
  const raw = Number(process.env.STAR_HOME_PROBE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 20) return Math.min(Math.round(raw), 20_000);
  return 12_000;
}

export function formatProbeMessage(confirmed: boolean, elapsedMs: number): string {
  const ms = Math.max(0, Math.round(elapsedMs));
  return confirmed ? `${ms} мс · подтверждено` : `${ms} мс · нет ответа`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeCommand(device: Device): { command: SmartCommandName; value: unknown } | null {
  const available = smartCommands.filter((command) => deviceCan(device, command));
  const ranked = [...available].sort((left, right) => riskRank(left, device) - riskRank(right, device));
  const command = ranked[0];
  if (!command) return null;
  if (command === "setPower") return { command, value: device.state?.on ?? true };
  if (command === "setBrightness") return { command, value: device.state?.brightness ?? 1 };
  if (command === "setTemperature") return { command, value: device.state?.targetC ?? 21 };
  if (command === "setHvacMode") return { command, value: device.state?.mode ?? "heat" };
  if (command === "setPosition") return { command, value: device.state?.position ?? 0 };
  if (command === "open" || command === "close") {
    return deviceCan(device, "close") ? { command: "close", value: undefined } : { command, value: undefined };
  }
  return { command, value: undefined };
}

function asProbeResult(value: unknown): ProbeResult | null {
  return value === "confirmed" || value === "failed" ? value : null;
}

function persistProbe(deviceId: string, elapsedMs: number, confirmed: boolean): { at: string; ms: number; result: ProbeResult } {
  const file = readOps();
  const device = file.devices.find((item) => item.id === deviceId);
  const at = new Date().toISOString();
  const ms = Math.max(0, Math.round(elapsedMs));
  const result: ProbeResult = confirmed ? "confirmed" : "failed";
  if (device) {
    device.metadata = { ...device.metadata, lastProbeAt: at, lastProbeMs: ms, lastProbeResult: result };
    writeOps(file);
  }
  return { at, ms, result };
}

export async function waitForGatewayAck(commandId: string, timeoutMs: number): Promise<{ status: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const row = readOps().gatewayCommands.find((item) => item.id === commandId);
    if (row && (row.status === "ACKED" || row.status === "FAILED" || row.status === "EXPIRED")) {
      return { status: row.status };
    }
    await sleep(pollMs);
  }
  const row = readOps().gatewayCommands.find((item) => item.id === commandId);
  return { status: row?.status ?? "TIMEOUT" };
}

export async function probeDevice(actor: StaffActor, deviceId: unknown): Promise<Result<ProbeView>> {
  if (!can(actor, "devices.command")) return denied;
  const found = deviceFor(actor, deviceId);
  if (!found.ok) return found;
  const picked = probeCommand(found.value);
  if (!picked) return { ok: false, status: 400, message: "Нет команды для проверки." };
  const started = Date.now();
  const session = { userId: actor.userId, membershipId: actor.membershipId };
  let outcome = await commandDeviceSmart(session, {
    deviceId: found.value.id,
    command: picked.command,
    value: picked.value,
    source: "probe",
  });
  if (outcome.ok && outcome.value.needsConfirm && typeof outcome.value.token === "string") {
    outcome = await commandDeviceSmart(session, { confirmToken: outcome.value.token, source: "probe" });
  }
  if (!outcome.ok) return outcome;
  let confirmed = outcome.value.confirmed === true;
  if (!confirmed && outcome.value.status === "accepted" && outcome.value.commandId) {
    const waited = await waitForGatewayAck(outcome.value.commandId, probeTimeoutMs());
    confirmed = waited.status === "ACKED";
  }
  const elapsedMs = Math.max(0, Date.now() - started);
  const stored = persistProbe(found.value.id, elapsedMs, confirmed);
  recordAudit({
    actorUserId: actor.userId,
    companyId: found.value.companyId,
    objectId: found.value.objectId,
    unitId: found.value.unitId,
    action: "DEVICE_PROBE",
    targetType: "device",
    targetId: found.value.id,
    target: found.value.name,
    result: confirmed ? "SUCCESS" : "ERROR",
    reason: confirmed ? "" : "Нет ответа",
  });
  return {
    ok: true,
    value: {
      confirmed,
      elapsedMs: stored.ms,
      message: formatProbeMessage(confirmed, stored.ms),
      status: confirmed ? "confirmed" : "failed",
      commandId: outcome.value.commandId,
      lastProbeAt: stored.at,
      lastProbeMs: stored.ms,
      lastProbeResult: stored.result,
    },
  };
}

function placed(device: Device): boolean {
  if (device.place === "OBJECT" || device.place === "STREET") return true;
  return Boolean(device.roomId);
}

export function handOverDevice(actor: StaffActor, deviceId: unknown, recall?: unknown): Result<HandoverView> {
  if (!can(actor, "devices.edit")) return denied;
  const found = deviceFor(actor, deviceId);
  if (!found.ok) return found;
  const file = readOps();
  const device = file.devices.find((item) => item.id === found.value.id);
  if (!device) return { ok: false, status: 404, message: "Устройство не найдено" };
  const takeBack = recall === true;
  const now = new Date().toISOString();
  if (takeBack) {
    device.metadata = { ...device.metadata, handedOver: false };
    device.updatedAt = now;
    writeOps(file);
    recordAudit({
      actorUserId: actor.userId,
      companyId: device.companyId,
      objectId: device.objectId,
      unitId: device.unitId,
      action: "DEVICE_HANDOVER",
      targetType: "device",
      targetId: device.id,
      target: device.name,
      reason: "Забрано у жильца",
    });
    return { ok: true, value: { id: device.id, handedOver: false } };
  }
  if (asProbeResult(device.metadata?.lastProbeResult) !== "confirmed") {
    return { ok: false, status: 400, message: "Сначала проверьте устройство." };
  }
  device.metadata = { ...device.metadata, handedOver: true, handedOverAt: now };
  if (device.status === "UNCONFIGURED" && placed(device)) {
    if (device.availability === "UNKNOWN") device.availability = "ONLINE";
    device.status = deriveLifecycle({ ...device, status: undefined });
    if (device.status === "UNCONFIGURED") device.status = "ONLINE";
  }
  device.updatedAt = now;
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "DEVICE_HANDOVER",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    reason: "Передано жильцу",
  });
  return { ok: true, value: { id: device.id, handedOver: true } };
}
