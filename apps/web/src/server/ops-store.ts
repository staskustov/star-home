import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { capabilitiesFor, type Capability } from "@/server/device-capabilities";
import {
  capabilitiesTouchedByState,
  deriveLifecycle,
  stateSliceForCapability,
  type DeviceChannel,
  type DeviceLifecycle,
} from "@/server/device-channels";
import { deviceLabel, isOpener, residentSeesDevice, type DeviceKind } from "@/server/device-kinds";
import { findObject, findRoom, roomsOf } from "@/server/catalog-store";
import { boundValue, remember } from "@/server/store-bind";
import type { AccessEvent } from "@/types/domain";
import { timeZone } from "@/server/time-zone";
import { isGatewayStale, type GatewayExchange } from "@/server/gateway-contact";
import { demoExecutionAllowed, dataSourceOf, type DataSource } from "@/server/runtime-mode";

export type Pass = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  guestName: string;
  detail: string;
  vehicle: string;
  code: string;
  from?: string | null;
  to?: string | null;
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

export const gatewayAdapters = ["wirenboard", "mqtt", "modbus", "matter", "http", "knx", "onvif", "zigbee", "rs485", "simulator", "local"] as const;
export type GatewayAdapterKind = (typeof gatewayAdapters)[number];
export type DeviceAvailability = "ONLINE" | "OFFLINE" | "UNKNOWN";
export type GatewayStatus = "ONLINE" | "OFFLINE" | "DEGRADED" | "CONNECTING" | "ERROR";

export type NormalizedState = {
  on?: boolean;
  brightness?: number;
  temperatureC?: number;
  humidityPercent?: number;
  illuminanceLx?: number;
  co2Ppm?: number;
  pressureHpa?: number;
  targetC?: number;
  mode?: string;
  position?: number;
  latch?: "OPEN" | "CLOSED";
  detected?: boolean;
  watts?: number;
  kwh?: number;
  windMs?: number;
  windDeg?: number;
  rainMm?: number;
  uvIndex?: number;
  radiationUSv?: number;
  organics?: number;
  voltageV?: number;
  currentA?: number;
  frequencyHz?: number;
};

export const devicePlaces = ["OBJECT", "STREET", "ROOM"] as const;
export type DevicePlace = (typeof devicePlaces)[number];

export const staticOutdoorWeather = {
  temperatureC: 12.4,
  humidityPercent: 58,
  windMs: 2.4,
  radiationUSv: 0.11,
} as const;

export type Device = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  place?: DevicePlace;
  kind: DeviceKind;
  name: string;
  adapter: GatewayAdapterKind;
  endpoint?: string;
  work?: "ON" | "OFF" | "FAULT";
  latch?: "OPEN" | "CLOSED";
  displayName?: string;
  gatewayId?: string | null;
  roomId?: string | null;
  externalId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capabilities?: Capability[];
  channels?: DeviceChannel[];
  status?: DeviceLifecycle;
  availability?: DeviceAvailability;
  lastSeen?: string | null;
  state?: NormalizedState;
  updatedAt?: string;
  planFloor?: number | null;
  planX?: number | null;
  planY?: number | null;
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
  tokenHash?: string | null;
  pairedAt?: string | null;
  bufferLag?: number | null;
  mqtt?: "up" | "down" | "none" | null;
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
  kind?: "CALL" | "SOS";
  callerUserId?: string;
  callerName?: string;
};

export type SecurityChatMessage = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  actorUserId: string;
  actorName: string;
  role: string;
  body: string;
  at: string;
};

export type PushDevice = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device?: string;
  at: string;
};

export type AlarmStatus = "OPEN" | "ACCEPTED" | "CLOSED";

export type Notice = {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  body: string;
  at: string;
  severity?: "INFO" | "WARNING" | "ALERT";
  readAt?: string | null;
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
  name: "open_gate" | "create_pass" | "create_request" | "pay" | "switch_mode" | "control_device" | "set_temperature" | "run_scenario";
  token: string;
  mode?: "HOME" | "WORK" | "VACATION";
  deviceId?: string;
  command?: string;
  value?: unknown;
  scenarioId?: string;
};

export type SmartEventKind = "command" | "state" | "availability" | "gateway";

export type SmartEventSeverity = "INFO" | "WARNING" | "ALERT";
export type SmartEventSource = "USER" | "GATEWAY" | "SCENARIO" | "AI" | "SYSTEM";

export type SmartEvent = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  roomId?: string | null;
  deviceId: string | null;
  gatewayId: string | null;
  kind: SmartEventKind;
  title: string;
  result: "SUCCESS" | "ERROR" | "UNCONFIRMED";
  at: string;
  atIso?: string;
  severity?: SmartEventSeverity;
  source?: SmartEventSource;
  seq: number;
};

export type SmartHistoryPoint = {
  id: string;
  deviceId: string;
  objectId: string;
  at: string;
  state: NormalizedState;
  capability?: Capability;
};

export type PendingSmartCommand = {
  token: string;
  userId: string;
  deviceId: string;
  command: string;
  value: unknown;
  createdAt: string;
};

export const commandReplayMs = 15 * 60_000;
export const eventKeepMs = 90 * 24 * 60 * 60 * 1000;
export const seriesKeepMs = 30 * 24 * 60 * 60 * 1000;
export const seriesStepMs = 5 * 60_000;

export type GatewayCommand = {
  id: string;
  companyId: string;
  objectId: string;
  gatewayId: string;
  deviceId: string;
  command: string;
  value: unknown;
  status: "PENDING" | "SENT" | "ACKED" | "FAILED" | "EXPIRED";
  createdAt: string;
  expiresAt?: string;
  ackedAt?: string;
  sentAt?: string;
  error?: string;
};

export type DiscoveryScan = {
  id: string;
  companyId: string;
  objectId: string;
  gatewayId: string;
  commandId: string;
  status: "pending" | "completed" | "error";
  createdAt: string;
  completedAt?: string;
  error?: string;
  devices: {
    externalId: string;
    manufacturer: string | null;
    model: string | null;
    online: boolean;
    channels: { externalId: string; capability: string | null; displayName: string; unit: string; value: number | boolean | string | null }[];
    alreadyRegistered?: { deviceId: string; name: string };
  }[];
};

export type DeviceCommandLog = {
  id: string;
  at: string;
  actorUserId: string;
  source: "APP" | "ADMIN" | "AI" | "SCENARIO";
  companyId: string;
  objectId: string;
  unitId: string | null;
  deviceId: string;
  command: string;
  value: unknown;
  risk: "LOW" | "MEDIUM" | "HIGH";
  result: "SUCCESS" | "DENIED" | "ERROR" | "UNCONFIRMED";
  reason?: string;
  commandId?: string;
  gatewayId?: string | null;
};

export type DeviceFavorite = {
  userId: string;
  deviceId: string;
  at: string;
};

export type ScenarioTrigger = "MANUAL" | "LIFE_MODE" | "EVENT" | "SCHEDULE";

export type ScenarioStep = {
  deviceId: string;
  command: string;
  value?: unknown;
};

export type ScenarioCondition = {
  deviceId: string;
  field: "on" | "latch" | "detected" | "brightness";
  op: "eq";
  value: unknown;
};

export type Scenario = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  name: string;
  description?: string;
  trigger: ScenarioTrigger;
  lifeMode?: "HOME" | "WORK" | "VACATION";
  enabled?: boolean;
  conditions?: ScenarioCondition[];
  scheduleHour?: number;
  scheduleMinute?: number;
  lastRunAt?: string;
  steps: ScenarioStep[];
  runtime?: "cloud" | "gateway";
};

export type AutomationRun = {
  id: string;
  gatewayId: string;
  scenarioId?: string;
  ruleId?: string;
  at: string;
  confirmed: boolean;
};

export type CameraProtocol = "onvif" | "rtsp" | "http-snapshot";

export type CameraMedia = {
  deviceId: string;
  protocol: CameraProtocol;
  host: string;
  port?: number | null;
  path?: string | null;
  snapshotUrl?: string | null;
  username?: string | null;
  password?: string | null;
};

export type CameraFrame = {
  deviceId: string;
  gatewayId?: string;
  at: string;
  mime: "image/jpeg";
  bytes: string;
};

export type HomeChipKind = "LIFE_MODE" | "SCENARIO" | "ACTION";

export type HomeChip = {
  id: string;
  companyId: string;
  objectId: string;
  name: string;
  icon: string;
  kind: HomeChipKind;
  strip: "scenarios" | "actions";
  lifeMode?: "HOME" | "WORK" | "VACATION";
  scenarioId?: string | null;
  action?: string | null;
  deviceId?: string | null;
  sort: number;
  locked?: boolean;
};

export type HomeLayout = {
  userId: string;
  unitId: string;
  scenarioIds: string[];
  actionIds: string[];
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
  gatewayCommands: GatewayCommand[];
  discoveryScans: DiscoveryScan[];
  gatewayExchanges: GatewayExchange[];
  commandLogs: DeviceCommandLog[];
  favorites: DeviceFavorite[];
  scenarios: Scenario[];
  automationRuns: AutomationRun[];
  cameraMedia: CameraMedia[];
  cameraFrames: CameraFrame[];
  liveSeq: Record<string, number>;
  chats: SecurityChatMessage[];
  pushDevices: PushDevice[];
  homeChips: HomeChip[];
  homeLayouts: HomeLayout[];
  homeMetrics: HomeMetricsRow[];
  homeCovers: HomeCoverRow[];
};

export type HomeCoverRow = {
  objectId: string;
  companyId: string;
  unitId: string | null;
  photo: string;
};

export const homeMetricKeys = ["temperature", "humidity", "wind", "radiation", "co2", "organics"] as const;
export type HomeMetricKey = (typeof homeMetricKeys)[number];

export type HomeMetricSetting = {
  key: HomeMetricKey;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  sort: number;
};

export type HomeMetricsRow = {
  objectId: string;
  companyId: string;
  items: HomeMetricSetting[];
};

export type WeatherMetricView = {
  key: HomeMetricKey;
  label: string;
  icon: string;
  color: string;
  value: string;
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
  const file: OpsFile = {
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
        roomId: "room_84_living",
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
        roomId: "room_24_street",
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
        roomId: "room_24_street",
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
        roomId: "room_24_street",
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
        roomId: "room_24_kitchen",
      },
      {
        id: "dev_lock_84",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        kind: "LOCK",
        name: "Замок",
        adapter: "local",
        roomId: "room_84_living",
      },
      {
        id: "dev_weather_siyanie",
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: null,
        kind: "WEATHER",
        name: "Улица",
        adapter: "local",
        place: "STREET",
        state: { ...staticOutdoorWeather },
      },
      {
        id: "dev_weather_park",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: null,
        kind: "WEATHER",
        name: "Улица",
        adapter: "local",
        place: "STREET",
        state: { ...staticOutdoorWeather },
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
    gatewayCommands: [],
    discoveryScans: [],
    gatewayExchanges: [],
    commandLogs: [],
    favorites: [],
    scenarios: [],
    automationRuns: [],
    cameraMedia: [],
    cameraFrames: [],
    liveSeq: {},
    chats: [],
    pushDevices: [],
    homeChips: [],
    homeLayouts: [],
    homeMetrics: [],
    homeCovers: [],
  };
  for (const device of file.devices) {
    device.metadata = { ...device.metadata, demo: true };
  }
  return file;
}

function catalogDevices(): Device[] {
  return seed().devices;
}

export function isGatewayAdapter(value: unknown): value is GatewayAdapterKind {
  return typeof value === "string" && (gatewayAdapters as readonly string[]).includes(value);
}

export function adapterFromGateway(gateway: Gateway | null | undefined): GatewayAdapterKind {
  return gateway && isGatewayAdapter(gateway.adapter) ? gateway.adapter : "local";
}

export function isDemoDevice(device: Pick<Device, "adapter" | "gatewayId" | "metadata">): boolean {
  return device.metadata?.demo === true || (device.adapter === "local" && !device.gatewayId);
}

export function isDevicePlace(value: unknown): value is DevicePlace {
  return typeof value === "string" && (devicePlaces as readonly string[]).includes(value);
}

function bindDevicePlace(device: Device): void {
  const rooms = device.unitId ? roomsOf(device.unitId) : [];
  const streetRoom = rooms.find((room) => room.kind === "STREET");
  const indoor = rooms.find((room) => room.kind !== "STREET") ?? rooms[0];
  const outdoorName = /улиц|двор|калитк|ворот|шлагбаум/i.test(device.name);
  if (device.place === "STREET" || device.kind === "WEATHER") {
    device.place = "STREET";
    device.unitId = null;
    device.roomId = null;
    return;
  }
  if (device.roomId) {
    const room = findRoom(device.roomId);
    device.place = "ROOM";
    if (room) device.unitId = room.unitId;
    return;
  }
  if (device.unitId) {
    const room = outdoorName || device.kind === "CAMERA" ? streetRoom ?? indoor : indoor;
    device.place = "ROOM";
    device.roomId = room?.id ?? null;
    return;
  }
  device.place = outdoorName ? "STREET" : "OBJECT";
  device.roomId = null;
}

export function normalizeDevice(device: Device, reading?: DeviceReading): Device {
  device.displayName ??= device.name;
  device.gatewayId ??= null;
  device.roomId ??= null;
  device.externalId ??= null;
  device.manufacturer ??= null;
  device.model ??= null;
  device.serialNumber ??= null;
  device.capabilities = device.capabilities?.length ? device.capabilities : capabilitiesFor(device.kind);
  device.availability ??= "UNKNOWN";
  device.lastSeen ??= null;
  device.status = device.status ?? deriveLifecycle(device);
  device.planFloor ??= null;
  device.planX ??= null;
  device.planY ??= null;
  device.metadata ??= {};
  if (device.adapter === "local" && !device.gatewayId) {
    device.metadata.demo = true;
    if (device.metadata.source == null) device.metadata.source = "DEMO";
  }
  if (!device.work) device.work = "ON";
  if (isOpener(device.kind)) device.latch ??= "CLOSED";
  bindDevicePlace(device);
  if (device.kind === "WEATHER" && isDemoDevice(device) && demoExecutionAllowed()) {
    device.state = {
      temperatureC: device.state?.temperatureC ?? staticOutdoorWeather.temperatureC,
      humidityPercent: device.state?.humidityPercent ?? staticOutdoorWeather.humidityPercent,
      windMs: device.state?.windMs ?? staticOutdoorWeather.windMs,
      radiationUSv: device.state?.radiationUSv ?? staticOutdoorWeather.radiationUSv,
    };
  }
  if (
    reading &&
    (demoExecutionAllowed() || !isDemoDevice(device)) &&
    (device.kind === "CLIMATE" || device.capabilities?.includes("temperature") || device.capabilities?.includes("humidity"))
  ) {
    device.state = {
      ...device.state,
      temperatureC: reading.temperatureC,
      humidityPercent: reading.humidityPercent,
    };
  }
  return device;
}

export function recordSmartHistory(file: OpsFile, point: Omit<SmartHistoryPoint, "id">): void {
  const touched = point.capability ? [] : capabilitiesTouchedByState(point.state);
  const capability = point.capability ?? (touched.length === 1 ? touched[0] : undefined);
  const row = capability ? { ...point, capability } : point;
  const last = [...file.smartHistory].reverse().find((item) => item.deviceId === row.deviceId && (item.capability ?? null) === (row.capability ?? null));
  const nextAt = Date.parse(row.at);
  const prevAt = last ? Date.parse(last.at) : NaN;
  if (last && Number.isFinite(nextAt) && Number.isFinite(prevAt) && nextAt - prevAt < seriesStepMs) {
    last.at = row.at;
    last.state = row.state;
    last.capability = row.capability;
  } else {
    file.smartHistory.push({ ...row, id: newId("hist") });
  }
  trimSmartLayers(file);
}

export function recordChannelHistory(
  file: OpsFile,
  point: { deviceId: string; objectId: string; at: string; state: NormalizedState; capabilities?: Capability[] },
): void {
  const caps = point.capabilities?.length ? point.capabilities : capabilitiesTouchedByState(point.state);
  if (!caps.length) {
    recordSmartHistory(file, point);
    return;
  }
  for (const capability of [...new Set(caps)]) {
    const slice = stateSliceForCapability(capability, point.state);
    recordSmartHistory(file, {
      deviceId: point.deviceId,
      objectId: point.objectId,
      at: point.at,
      capability,
      state: Object.keys(slice).length ? slice : point.state,
    });
  }
}

export function expireGatewayCommands(file: OpsFile, now = Date.now()): void {
  for (const command of file.gatewayCommands) {
    if (command.status !== "PENDING") continue;
    const deadline = Date.parse(command.expiresAt ?? "") || Date.parse(command.createdAt) + commandReplayMs;
    if (Number.isFinite(deadline) && now > deadline) command.status = "EXPIRED";
  }
}

export function trimSmartLayers(file: OpsFile, now = Date.now()): void {
  file.smartEvents = file.smartEvents
    .filter((event) => {
      const at = event.atIso ? Date.parse(event.atIso) : NaN;
      return !Number.isFinite(at) || now - at <= eventKeepMs;
    })
    .slice(0, 200);
  file.smartHistory = file.smartHistory
    .filter((point) => {
      const at = Date.parse(point.at);
      return !Number.isFinite(at) || now - at <= seriesKeepMs;
    })
    .slice(-400);
  file.commandLogs = (file.commandLogs ?? []).slice(0, 400);
  file.gatewayExchanges = (file.gatewayExchanges ?? []).slice(0, 200);
  file.automationRuns = (file.automationRuns ?? []).slice(0, 200);
  file.cameraFrames = (file.cameraFrames ?? []).slice(0, 80);
}

export function commandExpired(command: GatewayCommand, now = Date.now()): boolean {
  if (command.status === "EXPIRED") return true;
  const deadline = Date.parse(command.expiresAt ?? "") || Date.parse(command.createdAt) + commandReplayMs;
  return Number.isFinite(deadline) && now > deadline;
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
  file.gatewayCommands ??= [];
  file.discoveryScans ??= [];
  file.gatewayExchanges ??= [];
  file.commandLogs ??= [];
  file.favorites ??= [];
  file.scenarios ??= [];
  file.automationRuns ??= [];
  file.cameraMedia ??= [];
  file.cameraFrames ??= [];
  file.liveSeq ??= {};
  file.chats ??= [];
  file.pushDevices ??= [];
  file.homeChips ??= [];
  file.homeLayouts ??= [];
  file.homeMetrics ??= [];
  file.homeCovers ??= [];
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
    gateway.tokenHash ??= null;
    gateway.pairedAt ??= null;
    gateway.bufferLag ??= null;
    gateway.mqtt ??= null;
    gateway.metadata ??= {};
  }
  for (const scenario of file.scenarios) {
    scenario.enabled ??= true;
    scenario.conditions ??= [];
    scenario.description ??= "";
    scenario.runtime ??= "cloud";
  }
  for (const event of file.smartEvents) {
    event.severity ??= event.kind === "availability" ? "WARNING" : "INFO";
    event.source ??= "SYSTEM";
    event.atIso ??= undefined;
  }
  for (const command of file.gatewayCommands) {
    command.expiresAt ??= new Date(Date.parse(command.createdAt) + commandReplayMs).toISOString();
  }
  expireGatewayCommands(file);
  trimSmartLayers(file);
  if (!file.removedDeviceIds.includes("dev_light_24") && !file.scenarios.some((item) => item.id === "scen_night_24")) {
    file.scenarios.push({
      id: "scen_night_24",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
      name: "Ночь",
      description: "Свет и шторы на ночь. Не отдельный режим жизни.",
      trigger: "MANUAL",
      enabled: true,
      steps: [
        { deviceId: "dev_light_24", command: "setPower", value: false },
        { deviceId: "dev_curtain_24", command: "setPosition", value: 0 },
      ],
    });
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

export function markNoticesRead(userId: string): Notice[] {
  const file = load();
  const at = new Date().toISOString();
  let changed = false;
  for (const notice of file.notices) {
    if (notice.userId !== userId || notice.readAt) continue;
    notice.readAt = at;
    changed = true;
  }
  if (changed) persist(file);
  return noticesForUser(userId);
}

export function unreadNoticeCount(userId: string): number {
  return load().notices.filter((notice) => notice.userId === userId && !notice.readAt).length;
}

export function addNotice(input: {
  companyId: string;
  userId: string;
  title: string;
  body: string;
  severity?: "INFO" | "WARNING" | "ALERT";
}): boolean {
  const file = load();
  const recent = file.notices.find((notice) => notice.userId === input.userId && notice.title === input.title && notice.body === input.body);
  if (recent && Date.parse(recent.at) > Date.now() - 10 * 60_000) return false;
  file.notices.unshift({
    id: newId("note"),
    companyId: input.companyId,
    userId: input.userId,
    title: input.title,
    body: input.body,
    at: clock(),
    severity: input.severity ?? "INFO",
  });
  file.notices = file.notices.slice(0, 200);
  persist(file);
  return true;
}

export function auditForObject(objectId: string): AuditEntry[] {
  return load().audit.filter((entry) => entry.objectId === objectId);
}

export function turnsForCompany(companyId: string): AiTurn[] {
  return load().turns.filter((turn) => turn.companyId === companyId);
}

export type CameraPresence = "configured" | "reachable" | "streaming" | "offline" | "unknown";

export function cameraPresenceOf(device: Pick<Device, "work">, configured: boolean, hasFrame: boolean): CameraPresence {
  if (device.work === "OFF" || device.work === "FAULT") return "offline";
  if (hasFrame) return "streaming";
  if (configured) return "configured";
  return "unknown";
}

export function cameraPresenceLabel(presence: CameraPresence): string {
  if (presence === "streaming") return "Есть кадр";
  if (presence === "configured" || presence === "reachable") return "Настроена";
  if (presence === "offline") return "Нет связи";
  return "Не подключена";
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
  cameras: { id: string; name: string; state: string; hasFrame: boolean; presence: CameraPresence }[];
  devices: {
    id: string;
    name: string;
    label: string;
    kind: string;
    state: "ON" | "OFF" | "FAULT";
    power?: boolean;
    latch?: "OPEN" | "CLOSED";
    commands: string[];
    stale?: boolean;
    source?: DataSource;
    roomId?: string | null;
    roomName?: string | null;
    favorite?: boolean;
  }[];
  facts: {
    lights: { on: number; total: number } | null;
    doors: { open: string[] } | null;
    energy: { watts?: number; kwh?: number } | null;
    alerts: string[];
  };
  controller: {
    status: string;
    lastSeen: string | null;
    stale: boolean;
    message: string | null;
    gateways?: { name: string; status: string; lastSeen: string | null; stale: boolean }[];
  } | null;
  weather: {
    temperatureC: number | null;
    humidityPercent: number | null;
    windMs: number | null;
    radiationUSv: number | null;
    co2Ppm: number | null;
    organics: number | null;
    metrics: WeatherMetricView[];
    source: DataSource;
  };
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
  const visible = file.devices.filter(
    (device) => device.objectId === objectId && (device.unitId === unitId || device.unitId === null) && residentSeesDevice(device),
  );
  const categories = [...new Set(visible.map((device) => deviceLabel(device.kind)))];
  return {
    climate: reading && (demoExecutionAllowed() || (climateDevice && !isDemoDevice(climateDevice)))
      ? { temperatureC: reading.temperatureC, humidityPercent: reading.humidityPercent }
      : climateDevice && !isDemoDevice(climateDevice) && typeof climateDevice.state?.temperatureC === "number" && typeof climateDevice.state.humidityPercent === "number"
        ? { temperatureC: climateDevice.state.temperatureC, humidityPercent: climateDevice.state.humidityPercent }
        : null,
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
      .filter((device) => device.kind === "CAMERA" && device.objectId === objectId && (device.unitId === unitId || device.unitId === null) && residentSeesDevice(device))
      .map((device) => {
        const media = file.cameraMedia.find((item) => item.deviceId === device.id);
        const hasFrame = file.cameraFrames.some((frame) => frame.deviceId === device.id);
        const presence = cameraPresenceOf(device, Boolean(media?.host), hasFrame);
        return {
          id: device.id,
          name: device.name,
          state: cameraPresenceLabel(presence),
          presence,
          hasFrame,
        };
      }),
    devices: visible.map((device) => {
        const opener = isOpener(device.kind);
        const caps = device.capabilities ?? [];
        return {
          id: device.id,
          name: device.name,
          label: deviceLabel(device.kind),
          kind: device.kind,
          state: device.work === "OFF" ? "OFF" : device.work === "FAULT" ? "FAULT" : "ON",
          power: device.state?.on,
          latch: opener ? ((device.state?.latch ?? device.latch) === "OPEN" ? "OPEN" : "CLOSED") : undefined,
          commands: [
            ...(caps.includes("power") ? (["setPower"] as const) : []),
            ...(opener || caps.includes("latch") ? (["open", "close"] as const) : []),
          ],
          stale: device.availability === "OFFLINE",
          source: dataSourceOf(device),
          roomId: device.roomId ?? null,
          roomName: device.roomId ? findRoom(device.roomId)?.name ?? null : null,
        };
      }),
    facts: homeFacts(visible),
    controller: homeController(file.gateways.filter((gateway) => gateway.objectId === objectId)),
    weather: outdoorWeather(objectId),
  };
}

export const homeMetricCatalog: Record<HomeMetricKey, { label: string; icon: string; color: string; suffix: string }> = {
  temperature: { label: "Температура", icon: "thermo", color: "#c2410c", suffix: "°" },
  humidity: { label: "Влажность", icon: "drop", color: "#1d4ed8", suffix: "%" },
  wind: { label: "Ветер", icon: "wind", color: "#0f766e", suffix: " м/с" },
  radiation: { label: "Радиация", icon: "radiation", color: "#a16207", suffix: " мкЗв/ч" },
  co2: { label: "CO₂", icon: "co2", color: "#15803d", suffix: " ppm" },
  organics: { label: "Органика", icon: "organics", color: "#6d28d9", suffix: "" },
};

export function defaultMetricItems(): HomeMetricSetting[] {
  return (["temperature", "humidity", "wind", "radiation"] as const).map((key, index) => ({
    key,
    label: homeMetricCatalog[key].label,
    icon: homeMetricCatalog[key].icon,
    color: homeMetricCatalog[key].color,
    enabled: true,
    sort: (index + 1) * 10,
  }));
}

export function metricsSettingsFor(objectId: string): HomeMetricSetting[] {
  const row = load().homeMetrics.find((item) => item.objectId === objectId);
  if (row?.items.length) return [...row.items].sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label, "ru"));
  return defaultMetricItems();
}

export function outdoorWeather(objectId: string) {
  const stations = load().devices.filter((device) => device.objectId === objectId && device.kind === "WEATHER");
  const values = outdoorWeatherOf(stations);
  const metrics = metricsSettingsFor(objectId)
    .filter((item) => item.enabled)
    .flatMap((item) => {
      const value = formatWeatherMetric(item.key, values);
      return value ? [{ key: item.key, label: item.label, icon: item.icon, color: item.color, value }] : [];
    });
  const source = stations[0] ? dataSourceOf(stations[0]) : values.temperatureC == null ? "UNKNOWN" : "UNKNOWN";
  return { ...values, metrics, source };
}

function outdoorWeatherOf(devices: Device[]) {
  const outdoor = devices.filter((device) => device.unitId === null);
  const pool = outdoor.length ? outdoor : devices;
  const numbers = (pick: (device: Device) => number | undefined) => {
    const value = pool.map(pick).find((item) => typeof item === "number" && Number.isFinite(item));
    return typeof value === "number" ? value : null;
  };
  return {
    temperatureC: numbers((device) => device.state?.temperatureC),
    humidityPercent: numbers((device) => device.state?.humidityPercent),
    windMs: numbers((device) => device.state?.windMs),
    radiationUSv: numbers((device) => device.state?.radiationUSv),
    co2Ppm: numbers((device) => device.state?.co2Ppm),
    organics: numbers((device) => device.state?.organics),
  };
}

function formatWeatherMetric(
  key: HomeMetricKey,
  values: {
    temperatureC: number | null;
    humidityPercent: number | null;
    windMs: number | null;
    radiationUSv: number | null;
    co2Ppm: number | null;
    organics: number | null;
  },
): string | null {
  const raw =
    key === "temperature"
      ? values.temperatureC
      : key === "humidity"
        ? values.humidityPercent
        : key === "wind"
          ? values.windMs
          : key === "radiation"
            ? values.radiationUSv
            : key === "co2"
              ? values.co2Ppm
              : values.organics;
  if (raw === null || !Number.isFinite(raw)) return null;
  return `${String(raw).replace(".", ",")}${homeMetricCatalog[key].suffix}`;
}

function homeController(gateways: Gateway[]): {
  status: string;
  lastSeen: string | null;
  stale: boolean;
  message: string | null;
  gateways: { name: string; status: string; lastSeen: string | null; stale: boolean }[];
} | null {
  const remote = gateways.filter((gateway) => gateway.adapter !== "local");
  if (!remote.length) return null;
  const rows = remote.map((gateway) => {
    const stale = isGatewayStale(gateway);
    return { name: gateway.name, status: gateway.status, lastSeen: gateway.lastSeen, stale };
  });
  const stale = rows.some((row) => row.stale);
  const first = rows.find((row) => row.stale) ?? rows[0];
  return {
    status: stale ? "OFFLINE" : (first?.status ?? "ONLINE"),
    lastSeen: first?.lastSeen ?? null,
    stale,
    message: stale ? "Контроллер недоступен." : null,
    gateways: rows,
  };
}

function homeFacts(devices: Device[]) {
  const lights = devices.filter((device) => device.kind === "LIGHTING");
  const openers = devices.filter((device) => isOpener(device.kind));
  const watts = devices.map((device) => device.state?.watts).find((value) => typeof value === "number");
  const kwh = devices.map((device) => device.state?.kwh).find((value) => typeof value === "number");
  const alerts = devices.filter((device) => device.work === "FAULT" || device.state?.detected === true);
  return {
    lights: lights.length ? { on: lights.filter((device) => device.state?.on === true).length, total: lights.length } : null,
    doors: openers.length
      ? { open: openers.filter((device) => (device.state?.latch ?? device.latch) === "OPEN").map((device) => device.name) }
      : null,
    energy: watts !== undefined || kwh !== undefined ? { watts, kwh } : null,
    alerts: alerts.map((device) => device.name),
  };
}
