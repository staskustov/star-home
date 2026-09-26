import { findDevice, findGateway, newId, readOps, writeOps, type GatewayCommand, type NormalizedState } from "@/server/ops-store";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

const queueKeep = 200;

export function enqueueGatewayCommand(input: {
  gatewayId: string;
  deviceId: string;
  command: string;
  value: unknown;
}): GatewayCommand {
  const file = readOps();
  const existing = file.gatewayCommands.find(
    (item) => item.gatewayId === input.gatewayId && item.deviceId === input.deviceId && item.command === input.command && item.status === "PENDING",
  );
  if (existing) return existing;
  const device = findDevice(input.deviceId);
  const gateway = findGateway(input.gatewayId);
  const row: GatewayCommand = {
    id: newId("gcmd"),
    companyId: device?.companyId ?? gateway?.companyId ?? "",
    objectId: device?.objectId ?? gateway?.objectId ?? "",
    gatewayId: input.gatewayId,
    deviceId: input.deviceId,
    command: input.command,
    value: input.value,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  file.gatewayCommands.unshift(row);
  file.gatewayCommands = file.gatewayCommands.slice(0, queueKeep);
  writeOps(file);
  return row;
}

export function markGatewayCommand(commandId: string, status: "ACKED" | "FAILED"): void {
  const file = readOps();
  const current = file.gatewayCommands.find((item) => item.id === commandId);
  if (!current) return;
  current.status = status;
  current.ackedAt = new Date().toISOString();
  writeOps(file);
}

export function pullGatewayCommands(gatewayId: string): GatewayCommand[] {
  return readOps().gatewayCommands.filter((item) => item.gatewayId === gatewayId && item.status === "PENDING");
}

export function ackGatewayCommand(
  gatewayId: string,
  input: { commandId?: unknown; confirmed?: unknown; state?: unknown; error?: unknown },
): Result<{ commandId: string; applied: boolean }> {
  if (typeof input.commandId !== "string" || !input.commandId) return { ok: false, status: 400, message: "Команда не найдена" };
  const file = readOps();
  const row = file.gatewayCommands.find((item) => item.id === input.commandId && item.gatewayId === gatewayId);
  if (!row) return { ok: false, status: 404, message: "Команда не найдена" };
  if (row.status !== "PENDING") return { ok: true, value: { commandId: row.id, applied: false } };
  const confirmed = input.confirmed === true;
  row.status = confirmed ? "ACKED" : "FAILED";
  row.ackedAt = new Date().toISOString();
  if (confirmed && input.state && typeof input.state === "object" && !Array.isArray(input.state)) {
    const device = file.devices.find((item) => item.id === row.deviceId && item.gatewayId === gatewayId);
    if (device) {
      const next = input.state as NormalizedState;
      device.state = { ...device.state, ...next };
      if (next.latch) device.latch = next.latch;
      device.lastSeen = row.ackedAt;
      device.availability = "ONLINE";
      file.smartHistory.push({ id: newId("hist"), deviceId: device.id, objectId: device.objectId, at: row.ackedAt, state: next });
      file.smartHistory = file.smartHistory.slice(-400);
    }
  }
  writeOps(file);
  return { ok: true, value: { commandId: row.id, applied: confirmed } };
}
