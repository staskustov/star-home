import {
  groupWirenboardDiscovery,
  topicsFromUnknown,
  type DiscoveredDeviceView,
} from "@/server/adapters/wirenboard-controls";
import { findDuplicateDevice } from "@/server/device-channels";
import { enqueueGatewayCommand } from "@/server/gateway-queue";
import { recordAudit } from "@/server/operations";
import { commandExpired, expireGatewayCommands, newId, readOps, writeOps, type DiscoveryScan } from "@/server/ops-store";
import { can, objectFor, type StaffActor } from "@/server/rbac/decide";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

export type DiscoveryScanView = {
  scanId: string;
  status: DiscoveryScan["status"];
  gatewayId: string;
  devices: DiscoveryScan["devices"];
  error?: string;
};

function asView(scan: DiscoveryScan): DiscoveryScanView {
  return {
    scanId: scan.id,
    status: scan.status,
    gatewayId: scan.gatewayId,
    devices: scan.devices,
    error: scan.error,
  };
}

function gatewayFor(actor: StaffActor, gatewayId: unknown) {
  if (typeof gatewayId !== "string" || !gatewayId) return { ok: false as const, status: 400, message: "Шлюз не найден" };
  const gateway = readOps().gateways.find((item) => item.id === gatewayId && item.companyId === actor.companyId);
  if (!gateway) return { ok: false as const, status: 404, message: "Шлюз не найден" };
  const object = objectFor(actor, gateway.objectId, "part");
  if (!object.ok) return object;
  return { ok: true as const, value: gateway };
}

function decorateRegistered(gatewayId: string, devices: DiscoveredDeviceView[]): DiscoveryScan["devices"] {
  const file = readOps();
  return devices.map((device) => {
    const existing = findDuplicateDevice(file.devices, gatewayId, device.externalId);
    return {
      ...device,
      alreadyRegistered: existing ? { deviceId: existing.id, name: existing.displayName ?? existing.name } : undefined,
    };
  });
}

function parseDiscovered(raw: unknown): DiscoveredDeviceView[] {
  if (Array.isArray(raw) && raw.some((item) => item && typeof item === "object" && "externalId" in item && "channels" in item)) {
    return (raw as DiscoveredDeviceView[]).filter((item) => typeof item.externalId === "string" && item.externalId);
  }
  const topics = topicsFromUnknown(raw);
  if (topics.length) return groupWirenboardDiscovery(topics);
  if (raw && typeof raw === "object" && Array.isArray((raw as { topics?: unknown }).topics)) {
    return groupWirenboardDiscovery(topicsFromUnknown((raw as { topics: unknown }).topics));
  }
  return [];
}

function finishExpired(scan: DiscoveryScan): DiscoveryScan {
  if (scan.status !== "pending") return scan;
  const file = readOps();
  expireGatewayCommands(file);
  const command = file.gatewayCommands.find((item) => item.id === scan.commandId);
  if (command && command.status === "PENDING" && !commandExpired(command)) return scan;
  scan.status = "error";
  scan.error = "Шлюз не ответил.";
  scan.completedAt = new Date().toISOString();
  writeOps(file);
  return scan;
}

export function startDiscovery(actor: StaffActor, gatewayId: unknown): Success<DiscoveryScanView> | Failure {
  if (!can(actor, "devices.create")) return denied;
  const found = gatewayFor(actor, gatewayId);
  if (!found.ok) return found;
  const file = readOps();
  const pending = file.discoveryScans.find((item) => item.gatewayId === found.value.id && item.status === "pending");
  if (pending) {
    const current = finishExpired(pending);
    if (current.status === "pending") return { ok: true, value: asView(current) };
  }
  const scanId = newId("scan");
  const queued = enqueueGatewayCommand({
    gatewayId: found.value.id,
    deviceId: found.value.id,
    command: "discover",
    value: { scanId },
  });
  const next = readOps();
  const scan: DiscoveryScan = {
    id: scanId,
    companyId: found.value.companyId,
    objectId: found.value.objectId,
    gatewayId: found.value.id,
    commandId: queued.id,
    status: "pending",
    createdAt: new Date().toISOString(),
    devices: [],
  };
  next.discoveryScans.unshift(scan);
  next.discoveryScans = next.discoveryScans.slice(0, 20);
  writeOps(next);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: found.value.objectId,
    action: "DEVICE_DISCOVER",
    targetType: "gateway",
    targetId: found.value.id,
    target: found.value.name,
  });
  return { ok: true, value: asView(scan) };
}

export function getDiscovery(actor: StaffActor, scanId: unknown): Success<DiscoveryScanView> | Failure {
  if (!can(actor, "devices.view")) return denied;
  if (typeof scanId !== "string" || !scanId) return { ok: false, status: 400, message: "Скан не найден" };
  const scan = readOps().discoveryScans.find((item) => item.id === scanId && item.companyId === actor.companyId);
  if (!scan) return { ok: false, status: 404, message: "Скан не найден" };
  const object = objectFor(actor, scan.objectId, "part");
  if (!object.ok) return object.status === 403 ? denied : { ok: false, status: 404, message: "Скан не найден" };
  return { ok: true, value: asView(finishExpired(scan)) };
}

export function completeDiscovery(gatewayId: string, commandId: string, input: { confirmed?: unknown; devices?: unknown; error?: unknown }): void {
  const file = readOps();
  const command = file.gatewayCommands.find((item) => item.id === commandId && item.gatewayId === gatewayId);
  const scanId = command && command.value && typeof command.value === "object" ? (command.value as { scanId?: string }).scanId : undefined;
  const scan = file.discoveryScans.find((item) => item.commandId === commandId || item.id === scanId);
  if (!scan || scan.gatewayId !== gatewayId) return;
  if (input.confirmed === true) {
    scan.status = "completed";
    scan.devices = decorateRegistered(gatewayId, parseDiscovered(input.devices));
    scan.error = undefined;
  } else {
    scan.status = "error";
    scan.error = typeof input.error === "string" && input.error.trim() ? input.error.trim().slice(0, 120) : "Шлюз не нашёл устройства.";
    scan.devices = [];
  }
  scan.completedAt = new Date().toISOString();
  writeOps(file);
}
