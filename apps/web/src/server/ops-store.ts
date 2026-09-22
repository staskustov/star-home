import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { boundValue, remember } from "@/server/store-bind";
import type { AccessEvent } from "@/types/domain";

export type Pass = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string;
  guestName: string;
  detail: string;
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

export type DeviceKind = "GATE" | "CLIMATE";

export type Device = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;
  kind: DeviceKind;
  name: string;
  adapter: "local" | "http";
  endpoint?: string;
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
  status: "OPEN" | "CLOSED";
  at: string;
};

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
  name: "open_gate" | "create_pass" | "create_request" | "pay";
  token: string;
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
  readings: DeviceReading[];
  alarms: Alarm[];
  notices: Notice[];
  audit: AuditEntry[];
  turns: AiTurn[];
  meters: Meter[];
  meterReadings: MeterReading[];
};

const filePath = path.join(process.cwd(), "data", "ops.json");
const globalStore = globalThis as typeof globalThis & { __starHomeOps?: OpsFile };

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function clock(): string {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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
      },
      {
        id: "pass_84",
        companyId: "cmp_star",
        objectId: "obj_park",
        unitId: "unit_84",
        guestName: "Гость",
        detail: "Завтра, корпус 2",
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
    ],
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
  };
}

function normalize(file: OpsFile): OpsFile {
  file.meters ??= [];
  file.meterReadings ??= [];
  for (const request of file.requests ?? []) {
    if ((request.status as string) === "NEW") request.status = "CREATED";
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
  const file = seed();
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
} {
  const file = load();
  const climateDevice = file.devices.find((device) => device.kind === "CLIMATE" && device.unitId === unitId);
  const reading = climateDevice ? file.readings.find((item) => item.deviceId === climateDevice.id) : undefined;
  const pass = file.passes.find((item) => item.unitId === unitId);
  const open = file.invoices.filter((invoice) => invoice.unitId === unitId && invoice.status === "OPEN");
  const event = file.events.find((item) => item.objectId === objectId);
  const meters = (file.meters ?? [])
    .filter((meter) => meter.unitId === unitId)
    .map((meter) => {
      const latest = (file.meterReadings ?? []).filter((item) => item.meterId === meter.id).at(-1);
      return { name: meter.name, value: latest ? latest.value.toString().replace(".", ",") : "—", unit: meter.unit };
    });
  return {
    climate: reading ? { temperatureC: reading.temperatureC, humidityPercent: reading.humidityPercent } : null,
    visitor: pass ? { title: pass.guestName, detail: pass.detail } : null,
    balance: open.length
      ? { amount: open.reduce((sum, invoice) => sum + invoice.amount, 0), currency: open[0]?.currency ?? "RUB" }
      : null,
    today: event ? { title: "Событие", detail: event.title } : null,
    meters,
  };
}
