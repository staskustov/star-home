import { placeFromSession, type Place, type SessionRef } from "@/server/actor";
import { findObject, findRoom, findUnit, roomsOf } from "@/server/catalog-store";
import { deviceLabel, isOpener } from "@/server/device-kinds";
import "./adapters/wirenboard";
import "./adapters/protocol-stubs";
import { executeOnAdapter } from "@/server/gateway-adapter";
import { enqueueGatewayCommand, markGatewayCommand } from "@/server/gateway-queue";
import { notifyIfAlert } from "@/server/smart-notices";
import { emitLive } from "@/server/live-bus";
import { recordAudit } from "@/server/operations";
import {
  clock,
  findDevice,
  findGateway,
  newId,
  readOps,
  writeOps,
  type Device,
  type Gateway,
  type PendingSmartCommand,
  type SmartEvent,
  type SmartHistoryPoint,
} from "@/server/ops-store";
import { can, reaches, staffActor, type StaffActor } from "@/server/rbac/decide";
import type { Permission } from "@/server/rbac/permissions";
import { householdCan } from "@/server/rbac/policy";
import { commandRisk, deviceCan, isSmartCommand, type SmartCommandName } from "@/server/smart-commands";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

type Viewer = { kind: "home"; place: Place } | { kind: "staff"; actor: StaffActor };

const staleAfterMs = 5 * 60_000;
const confirmTtlMs = 5 * 60_000;
const commandWindowMs = 60_000;
const commandsPerWindow = 20;
const commandHits = new Map<string, { count: number; resetAt: number }>();
const historyKeep = 400;
const eventKeep = 200;

function denied(status = 403): Failure {
  return { ok: false, status, message: status === 401 ? "Нужно войти" : "Нет доступа" };
}

export function smartViewer(session: SessionRef | null): Result<Viewer> {
  const staff = staffActor(session);
  if (staff.ok && can(staff.value, "devices.view")) return { ok: true, value: { kind: "staff", actor: staff.value } };
  const place = placeFromSession(session, "devices.view");
  if (place.ok) return { ok: true, value: { kind: "home", place: place.value } };
  if (!session) return denied(401);
  return denied(place.ok ? 403 : place.status);
}

function viewerCan(viewer: Viewer, permission: Permission): boolean {
  return viewer.kind === "staff" ? can(viewer.actor, permission) : householdCan(viewer.place.role, permission);
}

function viewerCompany(viewer: Viewer): string {
  return viewer.kind === "staff" ? viewer.actor.companyId : viewer.place.companyId;
}

function viewerUser(viewer: Viewer): string {
  return viewer.kind === "staff" ? viewer.actor.userId : viewer.place.userId;
}

export function viewerReaches(viewer: Viewer, row: { companyId: string; objectId: string; unitId?: string | null }): boolean {
  if (row.companyId !== viewerCompany(viewer)) return false;
  if (viewer.kind === "staff") return reaches(viewer.actor, row);
  return row.objectId === viewer.place.objectId && (row.unitId === viewer.place.unitId || row.unitId === null || row.unitId === undefined);
}

function rateOk(userId: string, now = Date.now()): boolean {
  const current = commandHits.get(userId);
  if (!current || current.resetAt <= now) {
    if (commandHits.size > 10_000) commandHits.clear();
    commandHits.set(userId, { count: 1, resetAt: now + commandWindowMs });
    return true;
  }
  current.count += 1;
  return current.count <= commandsPerWindow;
}

function isStale(device: Device, gateway?: Gateway | null): boolean {
  if (gateway && gateway.adapter !== "local" && gateway.status === "OFFLINE") return true;
  if (device.availability === "OFFLINE") return true;
  if (device.adapter === "local" && (!gateway || gateway.adapter === "local")) return false;
  if (!device.lastSeen) return true;
  const at = Date.parse(device.lastSeen);
  return !Number.isFinite(at) || Date.now() - at > staleAfterMs;
}

function knownState(state: Device["state"]): Device["state"] {
  if (!state) return {};
  const next: NonNullable<Device["state"]> = {};
  if (state.on !== undefined) next.on = state.on;
  if (state.brightness !== undefined) next.brightness = state.brightness;
  if (state.temperatureC !== undefined) next.temperatureC = state.temperatureC;
  if (state.humidityPercent !== undefined) next.humidityPercent = state.humidityPercent;
  if (state.targetC !== undefined) next.targetC = state.targetC;
  if (state.mode !== undefined) next.mode = state.mode;
  if (state.position !== undefined) next.position = state.position;
  if (state.latch !== undefined) next.latch = state.latch;
  if (state.detected !== undefined) next.detected = state.detected;
  return next;
}

function commandsFor(device: Device): SmartCommandName[] {
  return (["setPower", "setBrightness", "setTemperature", "setHvacMode", "setPosition", "open", "close", "stop"] as const).filter((command) =>
    deviceCan(device, command),
  );
}

function canPreviewCommand(viewer: Viewer, device: Device): boolean {
  return commandsFor(device).some((command) => {
    const risk = commandRisk(command, device);
    if (risk === "HIGH") return highAllowed(viewer, device);
    return viewerCan(viewer, "devices.command");
  });
}

function highAllowed(viewer: Viewer, device: Device): boolean {
  if (isOpener(device.kind) || device.capabilities?.includes("latch")) return viewerCan(viewer, "access.gate.open");
  return viewerCan(viewer, "engineering.command");
}

export type SmartDeviceCard = {
  id: string;
  name: string;
  typeLabel: string;
  roomId: string | null;
  roomName: string | null;
  availability: NonNullable<Device["availability"]>;
  stale: boolean;
  lastSeen: string | null;
  capabilities: string[];
  state: Device["state"];
  canCommand: boolean;
  commands: SmartCommandName[];
  technical?: {
    adapter: string;
    externalId: string | null;
    endpoint?: string;
    gatewayId: string | null;
    gatewayName: string | null;
    gatewayStatus: string | null;
    lastError: string | null;
  };
  planFloor?: number | null;
  planX?: number | null;
  planY?: number | null;
};

function asCard(device: Device, viewer: Viewer): SmartDeviceCard {
  const room = device.roomId ? findRoom(device.roomId) : undefined;
  const gateway = device.gatewayId ? findGateway(device.gatewayId) : undefined;
  const stale = isStale(device, gateway);
  const card: SmartDeviceCard = {
    id: device.id,
    name: device.displayName ?? device.name,
    typeLabel: deviceLabel(device.kind),
    roomId: device.roomId ?? null,
    roomName: room?.name ?? null,
    availability: device.availability ?? "UNKNOWN",
    stale,
    lastSeen: device.lastSeen ?? null,
    capabilities: device.capabilities ?? [],
    state: knownState(device.state),
    canCommand: canPreviewCommand(viewer, device),
    commands: commandsFor(device),
    planFloor: device.planFloor ?? null,
    planX: device.planX ?? null,
    planY: device.planY ?? null,
  };
  if (viewer.kind === "staff" && viewerCan(viewer, "engineering.view")) {
    card.technical = {
      adapter: device.adapter,
      externalId: device.externalId ?? null,
      endpoint: device.endpoint,
      gatewayId: device.gatewayId ?? null,
      gatewayName: gateway?.name ?? null,
      gatewayStatus: gateway?.status ?? null,
      lastError: gateway?.lastError ?? null,
    };
  }
  return card;
}

function scopedDevices(viewer: Viewer, objectId?: string): Device[] {
  return readOps().devices.filter((device) => {
    if (!viewerReaches(viewer, device)) return false;
    if (objectId && device.objectId !== objectId) return false;
    return true;
  });
}

function objectIdFor(viewer: Viewer, objectId: unknown): Result<string> {
  if (viewer.kind === "home") return { ok: true, value: viewer.place.objectId };
  if (typeof objectId === "string" && objectId) {
    if (!viewerReaches(viewer, { companyId: viewer.actor.companyId, objectId, unitId: null })) {
      const owned = readOps().devices.some((device) => device.objectId === objectId && device.companyId === viewer.actor.companyId);
      return owned ? denied() : { ok: false, status: 404, message: "Объект не найден" };
    }
    return { ok: true, value: objectId };
  }
  const first = scopedDevices(viewer)[0];
  if (!first) return { ok: true, value: viewer.actor.scope.objectId ?? "" };
  return { ok: true, value: first.objectId };
}

function findScopedDevice(viewer: Viewer, deviceId: unknown): Result<Device> {
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, status: 400, message: "Устройство не найдено" };
  const device = findDevice(deviceId);
  if (!device || device.companyId !== viewerCompany(viewer)) return { ok: false, status: 404, message: "Устройство не найдено" };
  if (!viewerReaches(viewer, device)) return denied();
  return { ok: true, value: device };
}

function rememberEvent(event: Omit<SmartEvent, "id" | "seq"> & { seq?: number }): SmartEvent {
  const file = readOps();
  file.liveSeq ??= {};
  const seq = event.seq ?? (file.liveSeq[event.objectId] ?? 0);
  const row: SmartEvent = { ...event, id: newId("sevt"), seq };
  file.smartEvents.unshift(row);
  file.smartEvents = file.smartEvents.slice(0, eventKeep);
  writeOps(file);
  return row;
}

function rememberHistory(point: Omit<SmartHistoryPoint, "id">): void {
  const file = readOps();
  file.smartHistory.push({ ...point, id: newId("hist") });
  file.smartHistory = file.smartHistory.slice(-historyKeep);
  writeOps(file);
}

function takePending(userId: string, token: string): PendingSmartCommand | null {
  const file = readOps();
  const index = file.pendingSmart.findIndex((item) => item.token === token && item.userId === userId);
  if (index < 0) return null;
  const row = file.pendingSmart[index];
  if (!row) return null;
  file.pendingSmart.splice(index, 1);
  writeOps(file);
  if (Date.now() - Date.parse(row.createdAt) > confirmTtlMs) return null;
  return row;
}

function storePending(row: PendingSmartCommand): void {
  const file = readOps();
  file.pendingSmart = file.pendingSmart.filter((item) => item.userId !== row.userId || item.deviceId !== row.deviceId);
  file.pendingSmart.push(row);
  writeOps(file);
}

export async function smartHomeStatus(session: SessionRef | null, objectId?: unknown): Promise<Result<{
  climate: { temperatureC: number; humidityPercent: number } | null;
  rooms: { id: string; name: string }[];
  devices: { total: number; online: number; stale: number; fault: number };
  gateway: { status: string; lastSeen: string | null; message?: string } | null;
}>> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  await (await import("./scenarios")).runDueSchedules(session);
  const object = objectIdFor(viewer.value, objectId);
  if (!object.ok) return object;
  const devices = scopedDevices(viewer.value, object.value);
  const unitId = viewer.value.kind === "home" ? viewer.value.place.unitId : undefined;
  const rooms = (unitId ? roomsOf(unitId) : []).map((room) => ({ id: room.id, name: room.name }));
  const climate = devices.find((device) => device.kind === "CLIMATE");
  const reading = climate ? readOps().readings.find((item) => item.deviceId === climate.id) : undefined;
  const gateways = readOps().gateways.filter((gateway) => gateway.objectId === object.value && viewerReaches(viewer.value, gateway));
  const gateway = gateways[0];
  return {
    ok: true,
    value: {
      climate: reading ? { temperatureC: reading.temperatureC, humidityPercent: reading.humidityPercent } : null,
      rooms,
      devices: {
        total: devices.length,
        online: devices.filter((device) => !isStale(device, device.gatewayId ? findGateway(device.gatewayId) : undefined) && device.work !== "FAULT").length,
        stale: devices.filter((device) => isStale(device, device.gatewayId ? findGateway(device.gatewayId) : undefined)).length,
        fault: devices.filter((device) => device.work === "FAULT").length,
      },
      gateway: gateway
        ? {
            status: gateway.status,
            lastSeen: gateway.lastSeen,
            message: gateway.status === "OFFLINE" && gateway.adapter !== "local" ? "Контроллер недоступен." : undefined,
          }
        : null,
    },
  };
}

export function smartHomeDevices(session: SessionRef | null, objectId?: unknown): Result<{ devices: SmartDeviceCard[] }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (viewer.value.kind === "staff" && (objectId === undefined || objectId === null || objectId === "")) {
    return { ok: true, value: { devices: scopedDevices(viewer.value).map((device) => asCard(device, viewer.value)) } };
  }
  const object = objectIdFor(viewer.value, objectId);
  if (!object.ok) return object;
  return { ok: true, value: { devices: scopedDevices(viewer.value, object.value).map((device) => asCard(device, viewer.value)) } };
}

export function smartHomeDevice(session: SessionRef | null, deviceId: unknown): Result<{ device: SmartDeviceCard }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  const device = findScopedDevice(viewer.value, deviceId);
  if (!device.ok) return device;
  return { ok: true, value: { device: asCard(device.value, viewer.value) } };
}

export function smartHomeRooms(session: SessionRef | null, objectId?: unknown): Result<{
  rooms: {
    id: string;
    name: string;
    kind: string;
    deviceCount: number;
    temperatureC: number | null;
    humidityPercent: number | null;
    lights: { on: number; total: number } | null;
    curtain: number | null;
  }[];
}> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  const unitId = viewer.value.kind === "home" ? viewer.value.place.unitId : undefined;
  if (!unitId) {
    const object = objectIdFor(viewer.value, objectId);
    if (!object.ok) return object;
    return { ok: true, value: { rooms: [] } };
  }
  const devices = scopedDevices(viewer.value);
  return {
    ok: true,
    value: {
      rooms: roomsOf(unitId).map((room) => {
        const inRoom = devices.filter((device) => device.roomId === room.id);
        const climate = inRoom.find((device) => typeof device.state?.temperatureC === "number");
        const lights = inRoom.filter((device) => device.kind === "LIGHTING");
        const curtain = inRoom.find((device) => device.kind === "CURTAIN" && typeof device.state?.position === "number");
        return {
          id: room.id,
          name: room.name,
          kind: room.kind,
          deviceCount: inRoom.length,
          temperatureC: typeof climate?.state?.temperatureC === "number" ? climate.state.temperatureC : null,
          humidityPercent: typeof climate?.state?.humidityPercent === "number" ? climate.state.humidityPercent : null,
          lights: lights.length ? { on: lights.filter((device) => device.state?.on === true).length, total: lights.length } : null,
          curtain: typeof curtain?.state?.position === "number" ? curtain.state.position : null,
        };
      }),
    },
  };
}

export function smartHomeRoomDevices(session: SessionRef | null, roomId: unknown): Result<{ room: { id: string; name: string }; devices: SmartDeviceCard[] }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (typeof roomId !== "string" || !roomId) return { ok: false, status: 400, message: "Помещение не найдено" };
  const room = findRoom(roomId);
  const company = viewerCompany(viewer.value);
  const catalog = room ? findObject(room.objectId) : undefined;
  if (!room || !catalog || catalog.companyId !== company) return { ok: false, status: 404, message: "Помещение не найдено" };
  if (!viewerReaches(viewer.value, { companyId: company, objectId: room.objectId, unitId: room.unitId })) return denied();
  return {
    ok: true,
    value: {
      room: { id: room.id, name: room.name },
      devices: scopedDevices(viewer.value).filter((device) => device.roomId === room.id).map((device) => asCard(device, viewer.value)),
    },
  };
}

export function smartHomeEvents(session: SessionRef | null, objectId?: unknown): Result<{ events: { id: string; title: string; at: string; result: string; deviceId: string | null }[] }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  const object = objectIdFor(viewer.value, objectId);
  if (!object.ok) return object;
  return {
    ok: true,
    value: {
      events: readOps()
        .smartEvents.filter((event) => event.objectId === object.value && viewerReaches(viewer.value, event))
        .slice(0, 50)
        .map((event) => ({ id: event.id, title: event.title, at: event.at, result: event.result, deviceId: event.deviceId })),
    },
  };
}

export function smartHomeHistory(session: SessionRef | null, deviceId: unknown, since?: unknown): Result<{ points: { at: string; state: Device["state"] }[] }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  const device = findScopedDevice(viewer.value, deviceId);
  if (!device.ok) return device;
  const keep = viewer.value.kind === "staff" ? 200 : 80;
  const from = typeof since === "string" && since ? Date.parse(since) : NaN;
  return {
    ok: true,
    value: {
      points: readOps()
        .smartHistory.filter((point) => point.deviceId === device.value.id && (!Number.isFinite(from) || Date.parse(point.at) >= from))
        .slice(-keep)
        .map((point) => ({ at: point.at, state: point.state })),
    },
  };
}

export type CommandInput = { deviceId?: unknown; command?: unknown; value?: unknown; confirmToken?: unknown; source?: unknown };

export async function commandDeviceSmart(session: SessionRef | null, input: CommandInput): Promise<Result<{
  confirmed: boolean;
  needsConfirm?: boolean;
  token?: string;
  message: string;
  status?: string;
  commandId?: string;
  lastSeen?: string | null;
  device?: SmartDeviceCard;
}>> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  const userId = viewerUser(viewer.value);
  if (!rateOk(userId)) return { ok: false, status: 429, message: "Слишком много команд" };

  let command = input.command;
  let value = input.value;
  let deviceId = input.deviceId;
  if (typeof input.confirmToken === "string" && input.confirmToken) {
    const pending = takePending(userId, input.confirmToken);
    if (!pending) return { ok: false, status: 400, message: "Подтверждение не найдено." };
    deviceId = pending.deviceId;
    command = pending.command;
    value = pending.value;
  }

  const found = findScopedDevice(viewer.value, deviceId);
  if (!found.ok) return found;
  const device = found.value;
  if (!isSmartCommand(command)) return { ok: false, status: 400, message: "Неизвестная команда" };
  if (!deviceCan(device, command)) return { ok: false, status: 400, message: "Команда недоступна для этого устройства" };

  const risk = commandRisk(command, device);
  if (risk === "HIGH") {
    if (!highAllowed(viewer.value, device)) return denied();
    if (typeof input.confirmToken !== "string" || !input.confirmToken) {
      const token = newId("sconfirm");
      storePending({ token, userId, deviceId: device.id, command, value, createdAt: new Date().toISOString() });
      return { ok: true, value: { confirmed: false, needsConfirm: true, token, message: "Подтвердите команду." } };
    }
  } else if (!viewerCan(viewer.value, "devices.command")) {
    return denied();
  }

  const gateway = device.gatewayId ? findGateway(device.gatewayId) : undefined;
  const queued =
    gateway && gateway.adapter !== "local"
      ? enqueueGatewayCommand({ gatewayId: gateway.id, deviceId: device.id, command, value })
      : undefined;
  if (gateway?.status === "OFFLINE" && gateway.adapter !== "local") {
    return {
      ok: true,
      value: {
        confirmed: false,
        status: "QUEUED",
        commandId: queued?.id,
        message: "Контроллер недоступен. Команда в очереди.",
        lastSeen: gateway.lastSeen,
      },
    };
  }

  const result = await executeOnAdapter(device, command, value);
  const file = readOps();
  const current = file.devices.find((item) => item.id === device.id);
  const now = new Date().toISOString();
  const before = current ? { work: current.work, detected: current.state?.detected } : undefined;
  if (result.confirmed && current && result.state) {
    current.state = { ...current.state, ...result.state };
    if (result.state.latch) current.latch = result.state.latch;
    current.lastSeen = now;
    current.availability = "ONLINE";
    current.updatedAt = now;
    if (queued) markGatewayCommand(queued.id, "ACKED");
  }
  writeOps(file);
  if (result.confirmed && current) {
    notifyIfAlert({
      companyId: current.companyId,
      objectId: current.objectId,
      unitId: current.unitId,
      name: current.name,
      before,
      after: { work: current.work, detected: current.state?.detected },
    });
  }

  const live = emitLive({
    objectId: device.objectId,
    kind: "device",
    title: result.confirmed ? `${device.name}: команда выполнена` : `${device.name}: команда не подтверждена`,
    deviceId: device.id,
  });
  rememberEvent({
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    deviceId: device.id,
    gatewayId: device.gatewayId ?? null,
    kind: "command",
    title: result.confirmed ? `${device.name}: ${command}` : `${device.name}: не подтверждено`,
    result: result.confirmed ? "SUCCESS" : "UNCONFIRMED",
    at: clock(),
    seq: live.seq,
  });
  if (result.confirmed && result.state) {
    rememberHistory({ deviceId: device.id, objectId: device.objectId, at: now, state: result.state });
    if (input.source !== "scenario") {
      const { runEventScenarios } = await import("./scenarios");
      await runEventScenarios(session, device.id);
    }
  }
  recordAudit({
    actorUserId: userId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "DEVICE_COMMAND",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    result: result.confirmed ? "SUCCESS" : "ERROR",
    reason: result.confirmed ? "" : result.error ?? "Нет подтверждения адаптера",
  });

  const fresh = findDevice(device.id);
  return {
    ok: true,
    value: {
      confirmed: result.confirmed,
      message: result.confirmed ? "Команда выполнена." : result.error === "gateway-offline" ? "Контроллер недоступен. Команда в очереди." : "Не удалось подтвердить выполнение.",
      status: result.confirmed ? "OK" : queued ? "QUEUED" : result.error === "gateway-offline" ? "CONTROLLER_UNAVAILABLE" : "UNCONFIRMED",
      commandId: queued?.id,
      lastSeen: fresh?.lastSeen ?? null,
      device: fresh ? asCard(fresh, viewer.value) : undefined,
    },
  };
}

export function placeDevice(
  session: SessionRef | null,
  input: { deviceId?: unknown; planFloor?: unknown; planX?: unknown; planY?: unknown },
): Result<{ id: string }> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (viewer.value.kind !== "staff" || !can(viewer.value.actor, "devices.edit")) return denied();
  const found = findScopedDevice(viewer.value, input.deviceId);
  if (!found.ok) return found;
  const floor = Number(input.planFloor);
  const x = Number(input.planX);
  const y = Number(input.planY);
  if (!Number.isFinite(floor) || floor < 1 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, status: 400, message: "Укажите место на плане" };
  }
  const file = readOps();
  const current = file.devices.find((item) => item.id === found.value.id);
  if (!current) return { ok: false, status: 404, message: "Устройство не найдено" };
  current.planFloor = Math.round(floor);
  current.planX = Math.min(100, Math.max(0, Math.round(x)));
  current.planY = Math.min(100, Math.max(0, Math.round(y)));
  writeOps(file);
  return { ok: true, value: { id: current.id } };
}

export function floorPlanFor(session: SessionRef | null, unitId?: unknown): Result<{
  floors: { floor: number; image: string; pins: { deviceId: string; name: string; x: number; y: number }[] }[];
}> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  const id = viewer.value.kind === "home" ? viewer.value.place.unitId : typeof unitId === "string" ? unitId : "";
  if (!id) return { ok: false, status: 400, message: "Единица не найдена" };
  const unit = findUnit(id);
  const object = unit ? findObject(unit.objectId) : undefined;
  if (!unit || !object || object.companyId !== viewerCompany(viewer.value)) {
    return { ok: false, status: 404, message: "Единица не найдена" };
  }
  if (viewer.value.kind === "home" && unit.objectId !== viewer.value.place.objectId) {
    return { ok: false, status: 404, message: "Единица не найдена" };
  }
  if (viewer.value.kind === "staff" && !reaches(viewer.value.actor, { companyId: object.companyId, objectId: unit.objectId, unitId: unit.id })) {
    return denied();
  }
  const devices = scopedDevices(viewer.value).filter((device) => device.unitId === unit.id || device.unitId === null);
  return {
    ok: true,
    value: {
      floors: (unit.plans ?? []).map((plan) => ({
        floor: plan.floor,
        image: plan.image,
        pins: devices
          .filter((device) => device.planFloor === plan.floor && device.planX != null && device.planY != null)
          .map((device) => ({ deviceId: device.id, name: device.displayName ?? device.name, x: device.planX as number, y: device.planY as number })),
      })),
    },
  };
}

export async function runHomeAction(
  session: SessionRef | null,
  input: { action?: unknown; confirmToken?: unknown },
): Promise<Result<{ confirmed: boolean; needsConfirm?: boolean; token?: string; message: string }>> {
  const viewer = smartViewer(session);
  if (!viewer.ok) return viewer;
  if (viewer.value.kind !== "home") return denied();
  if (!viewerCan(viewer.value, "devices.command")) return denied();
  const place = viewer.value.place;
  const action = input.action;
  if (action === "night") {
    const { runScenario } = await import("./scenarios");
    const night = readOps().scenarios.find(
      (scenario) => scenario.name === "Ночь" && scenario.unitId === place.unitId && viewerReaches(viewer.value, scenario),
    );
    if (!night) return { ok: false, status: 404, message: "Сценарий не найден" };
    const result = await runScenario(session, { scenarioId: night.id, confirmToken: input.confirmToken });
    if (!result.ok) return result;
    return { ok: true, value: { confirmed: result.value.confirmed, needsConfirm: result.value.needsConfirm, token: result.value.token, message: result.value.message } };
  }
  const devices = scopedDevices(viewer.value);
  const targets =
    action === "lights-off"
      ? devices.filter((device) => device.kind === "LIGHTING")
      : action === "curtains-close"
        ? devices.filter((device) => device.kind === "CURTAIN")
        : [];
  if (!targets.length) return { ok: false, status: 400, message: "Нет таких устройств" };
  for (const device of targets) {
    const result = await commandDeviceSmart(session, {
      deviceId: device.id,
      command: action === "lights-off" ? "setPower" : "setPosition",
      value: action === "lights-off" ? false : 0,
      confirmToken: input.confirmToken,
    });
    if (!result.ok) return result;
    if (result.value.needsConfirm) return { ok: true, value: { confirmed: false, needsConfirm: true, token: result.value.token, message: result.value.message } };
    if (!result.value.confirmed) return { ok: true, value: { confirmed: false, message: result.value.message } };
  }
  return { ok: true, value: { confirmed: true, message: "Готово." } };
}
