import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { capabilitiesFor, type Capability } from "@/server/device-capabilities";
import { deviceLabel, isOpener, type DeviceKind } from "@/server/device-kinds";
import { findObject, findRoom } from "@/server/catalog-store";
import { boundValue, remember } from "@/server/store-bind";
import type { AccessEvent } from "@/types/domain";
import { timeZone } from "@/server/time-zone";

export type Pass = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  guestName: string;
  detail: string;
  vehicle: string;
  code: string;
};

export const requestStatuses = ["CREATED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "WAITING", "DONE", "CLOSED"] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export type ServiceRequest = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  authorUserId: string;
  category: string;
  text: string;
  status: RequestStatus;
  fileName?: string;
};

export type Meter = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  name: string;
  unit: string;
};

export type MeterReading = {
  id: string;
  meterId: string;
  value: number;
  at: string;
};

export type Invoice = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  title: string;
  amount: number;
  currency: string;
  status: "OPEN" | "PAID";
};

export type { DeviceKind };

export const gatewayAdapters = ["wirenboard", "mqtt", "modbus", "matter", "http", "knx", "onvif", "local"] as const;
export type GatewayAdapterKind = (typeof gatewayAdapters)[number];
export type DeviceAvailability = "ONLINE" | "OFFLINE" | "UNKNOWN";
export type GatewayStatus = "ONLINE" | "OFFLINE" | "DEGRADED";

export type NormalizedState = {
  on?: boolean;
  brightness?: number;
  temperatureC?: number;
  humidityPercent?: number;
  targetC?: number;
  mode?: string;
  position?: number;
  latch?: "OPEN" | "CLOSED";
  detected?: boolean;
};

export type Device = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  kind: DeviceKind;
  name: string;
  adapter: "local" | "http" | "matter" | "mqtt" | "modbus" | "onvif" | "rs485";
  endpoint?: string;
  work?: "ON" | "OFF" | "FAULT";
  latch?: "OPEN" | "CLOSED";
  displayName?: string;
  gatewayId?: string | null;
  roomId?: string | null;
  externalId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  capabilities?: Capability[];
  availability?: DeviceAvailability;
  lastSeen?: string | null;
  state?: NormalizedState;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type Gateway = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  name: string;
  adapter: GatewayAdapterKind;
  status: GatewayStatus;
  version: string | null;
  lastSeen: string | null;
  lastError: string | null;
  internalAddress: string | null;
  metadata?: Record<string, unknown>;
};

export type DeviceReading = {
  deviceId: string;
  temperatureC: number;
  humidityPercent: number;
};

export type Alarm = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  title: string;
  status: AlarmStatus;
  at: string;
  handledBy?: string;
  handledAt?: string;
};

export type AlarmStatus = "OPEN" | "ACCEPTED" | "CLOSED";

export type Notice = {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  body: string;
  at: string;
};

export type AuditEntry = {
  id: string;
  actorUserId: string;
  companyId: string;
  objectId: string;
  action: string;
  target: string;
  result: "SUCCESS" | "ERROR";
  error: string;
  at: string;
};

export type StoredAccessEvent = AccessEvent & {
  companyId: string;
  objectId: string;
  unitId: string | null;
};

export type PendingTool = {
  name: "open_gate" | "create_pass" | "create_request" | "pay" | "switch_mode" | "control_device" | "set_temperature";
  token: string;
  mode?: "HOME" | "WORK" | "VACATION";
  deviceId?: string;
  command?: string;
  value?: unknown;
};

export type SmartEventKind = "command" | "state" | "availability" | "gateway";

export type SmartEvent = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  deviceId: string | null;
  gatewayId: string | null;
  kind: SmartEventKind;
  title: string;
  result: "SUCCESS" | "ERROR" | "UNCONFIRMED";
  at: string;
  seq: number;
};

export type SmartHistoryPoint = {
  id: string;
  deviceId: string;
  objectId: string;
  at: string;
  state: NormalizedState;
};

export type PendingSmartCommand = {
  token: string;
  userId: string;
  deviceId: string;
  command: string;
  value: unknown;
  createdAt: string;
};

export type ScenarioTrigger = "MANUAL" | "LIFE_MODE";

export type ScenarioStep = {
  deviceId: string;
  command: string;
  value?: unknown;
};

export type Scenario = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  name: string;
  trigger: ScenarioTrigger;
  lifeMode?: "HOME" | "WORK" | "VACATION";
  steps: ScenarioStep[];
};

export type AiTurn = {
  id: string;
  companyId: string;
  userId: string;
  unitId: string;
  prompt: string;
  reply: string;
  pending: PendingTool | null;
};

type OpsFile = {
  passes: Pass[];
  events: StoredAccessEvent[];
  requests: ServiceRequest[];
  invoices: Invoice[];
  devices: Device[];
  gateways: Gateway[];
  removedDeviceIds: string[];
  readings: DeviceReading[];
  alarms: Alarm[];
  notices: Notice[];
  audit: AuditEntry[];
  turns: AiTurn[];
  meters: Meter[];
  meterReadings: MeterReading[];
  smartEvents: SmartEvent[];
  smartHistory: SmartHistoryPoint[];
  pendingSmart: PendingSmartCommand[];
  scenarios: Scenario[];
  liveSeq: Record<string, number>;
};

const filePath = path.join(process.cwd(), "data", "ops.json");
const globalStore = globalThis as typeof globalThis & { __starHomeOps?: OpsFile };

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function clock(): string {
  const date = new Date();
  const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${day} ${time}`;
}

function seed(): OpsFile {
  return {
    passes: [
      {
        id: "pass_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        guestName: "Гость",
        detail: "Ожидается сегодня до 18:00",
        vehicle: "",
        code: "A1B2C3D4",
      },
      {
        id: "pass_84",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        guestName: "Гость",
        detail: "Завтра, корпус 2",
        vehicle: "",
        code: "E5F60718",
      },
    ],
    events: [
      {
        id: "evt_seed_1",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        time: "12:42",
        title: "Гость, Дом №24",
        result: "SUCCESS",
      },
      {
        id: "evt_seed_2",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        time: "11:05",
        title: "Гость, Квартира №84",
        result: "SUCCESS",
      },
    ],
    requests: [],
    invoices: [
      {
        id: "inv_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        title: "Обслуживание",
        amount: 12450,
        currency: "RUB",
        status: "OPEN",
      },
      {
        id: "inv_84",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        title: "Обслуживание",
        amount: 8600,
        currency: "RUB",
        status: "OPEN",
      },
    ],
    devices: [
      {
        id: "dev_gate_siyanie",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: null,
        kind: "GATE",
        name: "Главные ворота",
        adapter: "local",
      },
      {
        id: "dev_gate_park",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: null,
        kind: "GATE",
        name: "Ворота комплекса",
        adapter: "local",
      },
      {
        id: "dev_climate_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "CLIMATE",
        name: "Климат дома",
        adapter: "local",
        roomId: "room_24_living",
      },
      {
        id: "dev_light_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "LIGHTING",
        name: "Свет в гостиной",
        adapter: "local",
        roomId: "room_24_living",
      },
      {
        id: "dev_curtain_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "CURTAIN",
        name: "Шторы спальни",
        adapter: "local",
        roomId: "room_24_bedroom",
      },
      {
        id: "dev_climate_84",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        kind: "CLIMATE",
        name: "Климат квартиры",
        adapter: "local",
      },
      {
        id: "dev_wicket_siyanie",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: null,
        kind: "WICKET",
        name: "Калитка",
        adapter: "local",
      },
      {
        id: "dev_barrier_park",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: null,
        kind: "BARRIER",
        name: "Шлагбаум",
        adapter: "local",
      },
      {
        id: "dev_camera_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "CAMERA",
        name: "Камера входа",
        adapter: "local",
        work: "ON",
      },
      {
        id: "dev_camera_yard_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "CAMERA",
        name: "Камера двора",
        adapter: "local",
        work: "ON",
      },
      {
        id: "dev_camera_wicket_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "CAMERA",
        name: "Камера калитки",
        adapter: "local",
        work: "OFF",
      },
      {
        id: "dev_leak_24",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: "unit_24",
        kind: "LEAK",
        name: "Датчик протечки",
        adapter: "local",
        work: "FAULT",
      },
      {
        id: "dev_lock_84",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        kind: "LOCK",
        name: "Замок",
        adapter: "local",
      },
    ],
    gateways: [],
    removedDeviceIds: [],
    readings: [
      { deviceId: "dev_climate_24", temperatureC: 22.4, humidityPercent: 48 },
      { deviceId: "dev_climate_84", temperatureC: 21.1, humidityPercent: 41 },
    ],
    alarms: [],
    notices: [],
    audit: [],
    turns: [],
    meters: [
      { id: "meter_24_water", companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", name: "Вода", unit: "м³" },
      { id: "meter_84_water", companyId: "cmp_star", objectId: "obj_park", unitId: "unit_84", name: "Вода", unit: "м³" },
    ],
    meterReadings: [
      { id: "read_24_water", meterId: "meter_24_water", value: 128.4, at: "01.09" },
      { id: "read_84_water", meterId: "meter_84_water", value: 86.2, at: "01.09" },
    ],
    smartEvents: [],
    smartHistory: [],
    pendingSmart: [],
    scenarios: [],
    liveSeq: {},
  };
}

function catalogDevices(): Device[] {
  return seed().devices;
}

export function isGatewayAdapter(value: unknown): value is GatewayAdapterKind {
  return typeof value === "string" && (gatewayAdapters as readonly string[]).includes(value);
}

export function normalizeDevice(device: Device, reading?: DeviceReading): Device {
  device.displayName ??= device.name;
  device.gatewayId ??= null;
  device.roomId ??= null;
  device.externalId ??= null;
  device.manufacturer ??= null;
  device.model ??= null;
  device.capabilities = device.capabilities?.length ? device.capabilities : capabilitiesFor(device.kind);
  device.availability ??= "UNKNOWN";
  device.lastSeen ??= null;
  device.metadata ??= {};
  if (!device.work) device.work = "ON";
  if (isOpener(device.kind)) device.latch ??= "CLOSED";
  if (reading && (device.kind === "CLIMATE" || device.capabilities?.includes("temperature") || device.capabilities?.includes("humidity"))) {
    device.state = {
      ...device.state,
      temperatureC: reading.temperatureC,
      humidityPercent: reading.humidityPercent,
    };
  }
  return device;
}

function normalize(file: OpsFile): OpsFile {
  file.meters ??= [];
  file.meterReadings ??= [];
  file.passes ??= [];
  file.devices ??= [];
  file.gateways ??= [];
  file.removedDeviceIds ??= [];
  file.smartEvents ??= [];
  file.smartHistory ??= [];
  file.pendingSmart ??= [];
  file.scenarios ??= [];
  file.liveSeq ??= {};
  for (const request of file.requests ?? []) {
    if ((request.status as string) === "NEW") request.status = "CREATED";
  }
  for (const pass of file.passes) {
    pass.vehicle ??= "";
    if (!pass.code || pass.code.length < 6) {
      pass.code = createHash("sha256").update(pass.id).digest("hex").slice(0, 8).toUpperCase();
    }
  }
  for (const device of catalogDevices()) {
    if (!findObject(device.objectId) || file.removedDeviceIds.includes(device.id) || file.devices.some((item) => item.id === device.id)) continue;
    file.devices.push({ ...device });
  }
  for (const device of file.devices) {
    if (!device.work) {
      const seeded = catalogDevices().find((item) => item.id === device.id);
      device.work = seeded?.work ?? "ON";
    }
    const reading = file.readings.find((item) => item.deviceId === device.id);
    normalizeDevice(device, reading);
  }
  for (const gateway of file.gateways) {
    gateway.unitId ??= null;
    gateway.status ??= "OFFLINE";
    gateway.version ??= null;
    gateway.lastSeen ??= null;
    gateway.lastError ??= null;
    gateway.internalAddress ??= null;
    gateway.metadata ??= {};
  }
  return file;
}

function load(): OpsFile {
  if (globalStore.__starHomeOps) return globalStore.__starHomeOps;
  const bound = boundValue("ops");
  if (bound) {
    globalStore.__starHomeOps = normalize(bound as OpsFile);
    return globalStore.__starHomeOps;
  }
  if (existsSync(filePath)) {
    globalStore.__starHomeOps = normalize(JSON.parse(readFileSync(filePath, "utf8")) as OpsFile);
    return globalStore.__starHomeOps;
  }
  const file = normalize(seed());
  persist(file);
  return file;
}

function persist(file: OpsFile): void {
  globalStore.__starHomeOps = file;
  if (remember("ops", file)) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(file));
}

export function newId(prefix: string): string {
  return id(prefix);
}

export function readOps(): OpsFile {
  return load();
}

export function writeOps(file: OpsFile): void {
  persist(file);
}

export function passesForUnit(unitId: string): Pass[] {
  return load().passes.filter((pass) => pass.unitId === unitId);
}

export function passesForObject(objectId: string): Pass[] {
  return load().passes.filter((pass) => pass.objectId === objectId);
}

export function eventsForObject(objectId: string): StoredAccessEvent[] {
  return load().events.filter((event) => event.objectId === objectId);
}

export function requestsForUnit(unitId: string): ServiceRequest[] {
  return load().requests.filter((request) => request.unitId === unitId);
}

export function requestsForObject(objectId: string): ServiceRequest[] {
  return load().requests.filter((request) => request.objectId === objectId);
}

export function invoicesForUnit(unitId: string): Invoice[] {
  return load().invoices.filter((invoice) => invoice.unitId === unitId);
}

export function invoicesForObject(objectId: string): Invoice[] {
  return load().invoices.filter((invoice) => invoice.objectId === objectId);
}

export function devicesForObject(objectId: string): Device[] {
  return load().devices.filter((device) => device.objectId === objectId);
}

export function gatewaysForObject(objectId: string): Gateway[] {
  return load().gateways.filter((gateway) => gateway.objectId === objectId);
}

export function findDevice(deviceId: string): Device | undefined {
  return load().devices.find((device) => device.id === deviceId);
}

export function findGateway(gatewayId: string): Gateway | undefined {
  return load().gateways.find((gateway) => gateway.id === gatewayId);
}

export function alarmsForObject(objectId: string): Alarm[] {
  return load().alarms.filter((alarm) => alarm.objectId === objectId);
}

export function noticesForUser(userId: string): Notice[] {
  return load().notices.filter((notice) => notice.userId === userId);
}

export function auditForObject(objectId: string): AuditEntry[] {
  return load().audit.filter((entry) => entry.objectId === objectId);
}

export function turnsForCompany(companyId: string): AiTurn[] {
  return load().turns.filter((turn) => turn.companyId === companyId);
}

export function homeSignals(unitId: string, objectId: string): {
  climate: { temperatureC: number; humidityPercent: number } | null;
  visitor: { title: string; detail: string } | null;
  balance: { amount: number; currency: string } | null;
  today: { title: string; detail: string } | null;
  meters: { name: string; value: string; unit: string }[];
  request: { title: string; detail: string; authorUserId: string } | null;
  payments: { title: string; amount: number; currency: string }[];
  categories: string[];
  cameras: { name: string; state: string }[];
  devices: { id: string; name: string; label: string; state: "ON" | "OFF" | "FAULT"; stale?: boolean; roomName?: string | null }[];
} {
  const file = load();
  const climateDevice = file.devices.find((device) => device.kind === "CLIMATE" && device.unitId === unitId);
  const reading = climateDevice ? file.readings.find((item) => item.deviceId === climateDevice.id) : undefined;
  const pass = file.passes.find((item) => item.unitId === unitId);
  const invoices = file.invoices.filter((invoice) => invoice.unitId === unitId);
  const open = invoices.filter((invoice) => invoice.status === "OPEN");
  const event = file.events.find((item) => item.objectId === objectId && (item.unitId === unitId || !item.unitId));
  const request = file.requests.find((item) => item.unitId === unitId && item.status !== "DONE" && item.status !== "CLOSED");
  const meters = (file.meters ?? [])
    .filter((meter) => meter.unitId === unitId)
    .map((meter) => {
      const latest = (file.meterReadings ?? []).filter((item) => item.meterId === meter.id).at(-1);
      return { name: meter.name, value: latest ? latest.value.toString().replace(".", ",") : "—", unit: meter.unit };
    });
  const categories = [
    ...new Set(
      file.devices
        .filter((device) => device.objectId === objectId && (device.unitId === unitId || device.unitId === null))
        .map((device) => deviceLabel(device.kind)),
    ),
  ];
  return {
    climate: reading ? { temperatureC: reading.temperatureC, humidityPercent: reading.humidityPercent } : null,
    visitor: pass ? { title: pass.guestName, detail: pass.detail } : null,
    balance: open.length
      ? { amount: open.reduce((sum, invoice) => sum + invoice.amount, 0), currency: open[0]?.currency ?? "RUB" }
      : null,
    today: event ? { title: "Событие", detail: event.title } : null,
    meters,
    request: request ? { title: request.category, detail: request.text, authorUserId: request.authorUserId } : null,
    payments: invoices
      .filter((invoice) => invoice.status === "PAID")
      .map((invoice) => ({ title: invoice.title, amount: invoice.amount, currency: invoice.currency })),
    categories,
    cameras: file.devices
      .filter((device) => device.kind === "CAMERA" && device.unitId === unitId)
      .map((device) => ({ name: device.name, state: device.work === "OFF" ? "Отключено" : device.work === "FAULT" ? "Неисправно" : "На связи" })),
    devices: file.devices
      .filter((device) => device.objectId === objectId && (device.unitId === unitId || device.unitId === null))
      .map((device) => ({
        id: device.id,
        name: device.name,
        label: deviceLabel(device.kind),
        state: device.work === "OFF" ? "OFF" : device.work === "FAULT" ? "FAULT" : "ON",
        stale: device.availability === "OFFLINE",
        roomName: device.roomId ? findRoom(device.roomId)?.name ?? null : null,
      })),
  };
}
