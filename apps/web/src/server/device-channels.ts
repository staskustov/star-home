import { isCapability, type Capability } from "@/server/device-capabilities";

export const channelDataTypes = ["number", "boolean", "enum", "string"] as const;
export type ChannelDataType = (typeof channelDataTypes)[number];

export const channelQualities = ["GOOD", "STALE", "UNKNOWN", "fresh", "stale", "unavailable", "unknown", "error"] as const;
export type ChannelQuality = (typeof channelQualities)[number];

export const channelStatuses = ["LIVE", "STALE", "NONE", "ERROR"] as const;
export type ChannelStatus = (typeof channelStatuses)[number];

export const deviceLifecycles = [
  "DISCOVERED",
  "UNCONFIGURED",
  "ONLINE",
  "OFFLINE",
  "DEGRADED",
  "ERROR",
  "DISABLED",
  "REMOVED",
] as const;
export type DeviceLifecycle = (typeof deviceLifecycles)[number];

export type DeviceChannel = {
  id: string;
  deviceId: string;
  externalId: string;
  name: string;
  displayName: string;
  capability: Capability;
  unit: string;
  dataType: ChannelDataType;
  readable: boolean;
  writable: boolean;
  value?: number | boolean | string | null;
  min?: number;
  max?: number;
  precision?: number;
  enabled: boolean;
  status: ChannelStatus;
  lastValueAt?: string;
  metadata?: Record<string, unknown>;
};

export type PublicChannel = {
  id: string;
  capability: Capability;
  displayName: string;
  unit: string;
  value: number | boolean | string | null;
  status: ChannelStatus;
  quality: ChannelQuality;
  writable: boolean;
};

export type ChannelState = {
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
  voltageV?: number;
  currentA?: number;
  frequencyHz?: number;
};

export type ChannelHost = {
  id: string;
  kind?: string;
  adapter?: string;
  place?: string | null;
  capabilities?: Capability[];
  channels?: DeviceChannel[];
  state?: ChannelState;
  lastSeen?: string | null;
  work?: string;
  availability?: string;
  status?: DeviceLifecycle;
  metadata?: Record<string, unknown>;
};

type CapabilityMeta = {
  unit: string;
  displayName: string;
  dataType: ChannelDataType;
  writable: boolean;
  precision?: number;
  aliases: string[];
};

const capabilityMeta: Record<Capability, CapabilityMeta> = {
  power: { unit: "", displayName: "Питание", dataType: "boolean", writable: true, aliases: ["power", "on", "relay", "switch"] },
  brightness: { unit: "%", displayName: "Яркость", dataType: "number", writable: true, precision: 0, aliases: ["brightness", "dimmer"] },
  temperature: { unit: "°C", displayName: "Температура", dataType: "number", precision: 1, writable: false, aliases: ["temperature", "temp", "t"] },
  humidity: { unit: "%", displayName: "Влажность", dataType: "number", precision: 0, writable: false, aliases: ["humidity", "hum", "rh"] },
  illuminance: { unit: "lx", displayName: "Освещенность", dataType: "number", precision: 0, writable: false, aliases: ["illuminance", "illumination", "lux", "light"] },
  co2: { unit: "ppm", displayName: "CO₂", dataType: "number", precision: 0, writable: false, aliases: ["co2", "co₂", "carbondioxide"] },
  pressure: { unit: "hPa", displayName: "Давление", dataType: "number", precision: 0, writable: false, aliases: ["pressure", "press", "atm"] },
  thermostat: { unit: "°C", displayName: "Термостат", dataType: "number", precision: 1, writable: true, aliases: ["thermostat", "target", "setpoint"] },
  position: { unit: "%", displayName: "Положение", dataType: "number", precision: 0, writable: true, aliases: ["position", "pos"] },
  latch: { unit: "", displayName: "Створ", dataType: "enum", writable: true, aliases: ["latch", "lock", "door", "gate"] },
  motion: { unit: "", displayName: "Движение", dataType: "boolean", writable: false, aliases: ["motion", "pir"] },
  presence: { unit: "", displayName: "Присутствие", dataType: "boolean", writable: false, aliases: ["presence", "occupancy"] },
  leak: { unit: "", displayName: "Протечка", dataType: "boolean", writable: false, aliases: ["leak", "flood"] },
  smoke: { unit: "", displayName: "Дым", dataType: "boolean", writable: false, aliases: ["smoke", "fire"] },
  contact: { unit: "", displayName: "Контакт", dataType: "boolean", writable: false, aliases: ["contact", "window", "reed"] },
  gas: { unit: "", displayName: "Газ", dataType: "boolean", writable: false, aliases: ["gas"] },
  energy: { unit: "kWh", displayName: "Энергия", dataType: "number", precision: 2, writable: false, aliases: ["energy", "kwh"] },
  voltage: { unit: "V", displayName: "Напряжение", dataType: "number", precision: 1, writable: false, aliases: ["voltage", "volt"] },
  current: { unit: "A", displayName: "Ток", dataType: "number", precision: 2, writable: false, aliases: ["current", "amp"] },
  frequency: { unit: "Hz", displayName: "Частота", dataType: "number", precision: 1, writable: false, aliases: ["frequency", "freq"] },
  water_flow: { unit: "m³/h", displayName: "Расход воды", dataType: "number", precision: 2, writable: false, aliases: ["waterflow", "flow"] },
  water_pressure: { unit: "bar", displayName: "Давление воды", dataType: "number", precision: 2, writable: false, aliases: ["waterpressure"] },
  water_level: { unit: "%", displayName: "Уровень воды", dataType: "number", precision: 0, writable: false, aliases: ["waterlevel", "level"] },
  wind: { unit: "m/s", displayName: "Ветер", dataType: "number", precision: 1, writable: false, aliases: ["wind", "windspeed"] },
  wind_direction: { unit: "°", displayName: "Направление ветра", dataType: "number", precision: 0, writable: false, aliases: ["winddirection", "winddir"] },
  rain: { unit: "mm", displayName: "Осадки", dataType: "number", precision: 1, writable: false, aliases: ["rain", "precip"] },
  uv: { unit: "", displayName: "УФ", dataType: "number", precision: 1, writable: false, aliases: ["uv", "uvindex"] },
  radiation: { unit: "µSv/h", displayName: "Радиация", dataType: "number", precision: 2, writable: false, aliases: ["radiation", "dose"] },
};

const aliasToCapability = new Map<string, Capability>();
for (const [capability, meta] of Object.entries(capabilityMeta) as [Capability, CapabilityMeta][]) {
  aliasToCapability.set(capability, capability);
  for (const alias of meta.aliases) aliasToCapability.set(normalizeAlias(alias), capability);
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s-]+/g, "").replace("₂", "2");
}

export function isDeviceLifecycle(value: unknown): value is DeviceLifecycle {
  return typeof value === "string" && (deviceLifecycles as readonly string[]).includes(value);
}

export function unitForCapability(capability: Capability): string {
  return capabilityMeta[capability].unit;
}

export function displayNameForCapability(capability: Capability): string {
  return capabilityMeta[capability].displayName;
}

export function normalizeCapabilityName(raw: unknown): Capability | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (isCapability(raw)) return raw;
  return aliasToCapability.get(normalizeAlias(raw)) ?? null;
}

export function channelIdFor(deviceId: string, capability: Capability): string {
  return `ch_${deviceId}_${capability}`;
}

export function valueFromState(capability: Capability, state: ChannelState | undefined): number | boolean | string | null {
  if (!state) return null;
  if (capability === "temperature") return finiteOrNull(state.temperatureC);
  if (capability === "humidity") return finiteOrNull(state.humidityPercent);
  if (capability === "illuminance") return finiteOrNull(state.illuminanceLx);
  if (capability === "co2") return finiteOrNull(state.co2Ppm);
  if (capability === "pressure") return finiteOrNull(state.pressureHpa);
  if (capability === "thermostat") return finiteOrNull(state.targetC);
  if (capability === "wind") return finiteOrNull(state.windMs);
  if (capability === "wind_direction") return finiteOrNull(state.windDeg);
  if (capability === "rain") return finiteOrNull(state.rainMm);
  if (capability === "uv") return finiteOrNull(state.uvIndex);
  if (capability === "radiation") return finiteOrNull(state.radiationUSv);
  if (capability === "brightness") return finiteOrNull(state.brightness);
  if (capability === "position") return finiteOrNull(state.position);
  if (capability === "energy") return finiteOrNull(state.kwh ?? state.watts);
  if (capability === "voltage") return finiteOrNull(state.voltageV);
  if (capability === "current") return finiteOrNull(state.currentA);
  if (capability === "frequency") return finiteOrNull(state.frequencyHz);
  if (capability === "power") return state.on ?? null;
  if (capability === "latch") return state.latch ?? null;
  if (capability === "motion" || capability === "presence" || capability === "leak" || capability === "smoke" || capability === "contact" || capability === "gas") {
    return state.detected ?? null;
  }
  return null;
}

function writeStateFromChannel(state: ChannelState, channel: DeviceChannel): void {
  const value = channel.value;
  if (value === undefined || value === null) return;
  if (channel.capability === "temperature" && typeof value === "number") state.temperatureC = value;
  if (channel.capability === "humidity" && typeof value === "number") state.humidityPercent = value;
  if (channel.capability === "illuminance" && typeof value === "number") state.illuminanceLx = value;
  if (channel.capability === "co2" && typeof value === "number") state.co2Ppm = value;
  if (channel.capability === "pressure" && typeof value === "number") state.pressureHpa = value;
  if (channel.capability === "thermostat" && typeof value === "number") state.targetC = value;
  if (channel.capability === "wind" && typeof value === "number") state.windMs = value;
  if (channel.capability === "wind_direction" && typeof value === "number") state.windDeg = value;
  if (channel.capability === "rain" && typeof value === "number") state.rainMm = value;
  if (channel.capability === "uv" && typeof value === "number") state.uvIndex = value;
  if (channel.capability === "radiation" && typeof value === "number") state.radiationUSv = value;
  if (channel.capability === "brightness" && typeof value === "number") state.brightness = value;
  if (channel.capability === "position" && typeof value === "number") state.position = value;
  if (channel.capability === "energy" && typeof value === "number") state.kwh = value;
  if (channel.capability === "voltage" && typeof value === "number") state.voltageV = value;
  if (channel.capability === "current" && typeof value === "number") state.currentA = value;
  if (channel.capability === "frequency" && typeof value === "number") state.frequencyHz = value;
  if (channel.capability === "power" && typeof value === "boolean") state.on = value;
  if (channel.capability === "latch" && (value === "OPEN" || value === "CLOSED")) state.latch = value;
  if (
    (channel.capability === "motion" ||
      channel.capability === "presence" ||
      channel.capability === "leak" ||
      channel.capability === "smoke" ||
      channel.capability === "contact" ||
      channel.capability === "gas") &&
    typeof value === "boolean"
  ) {
    state.detected = value;
  }
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function qualityOf(status: ChannelStatus, availability?: string | null): ChannelQuality {
  if (status === "ERROR") return "error";
  if (status === "STALE") return "STALE";
  if (status === "LIVE") return "GOOD";
  if (availability === "OFFLINE") return "unavailable";
  return "UNKNOWN";
}

const stateCapabilityKeys: [keyof ChannelState, Capability][] = [
  ["temperatureC", "temperature"],
  ["humidityPercent", "humidity"],
  ["illuminanceLx", "illuminance"],
  ["co2Ppm", "co2"],
  ["pressureHpa", "pressure"],
  ["targetC", "thermostat"],
  ["windMs", "wind"],
  ["windDeg", "wind_direction"],
  ["rainMm", "rain"],
  ["uvIndex", "uv"],
  ["radiationUSv", "radiation"],
  ["brightness", "brightness"],
  ["position", "position"],
  ["kwh", "energy"],
  ["watts", "energy"],
  ["voltageV", "voltage"],
  ["currentA", "current"],
  ["frequencyHz", "frequency"],
  ["on", "power"],
  ["latch", "latch"],
  ["detected", "motion"],
];

export function capabilitiesTouchedByState(state: ChannelState | undefined): Capability[] {
  if (!state) return [];
  const seen = new Set<Capability>();
  for (const [key, capability] of stateCapabilityKeys) {
    if (state[key] !== undefined) seen.add(capability);
  }
  return [...seen];
}

export function stateSliceForCapability(capability: Capability, state: ChannelState | undefined): ChannelState {
  const next: ChannelState = {};
  writeStateFromChannel(next, { capability, value: valueFromState(capability, state) } as DeviceChannel);
  return next;
}

export function pickNormalizedState(raw: unknown): ChannelState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as ChannelState;
  const next: ChannelState = {};
  if (typeof source.on === "boolean") next.on = source.on;
  if (typeof source.brightness === "number" && Number.isFinite(source.brightness)) next.brightness = source.brightness;
  if (typeof source.temperatureC === "number" && Number.isFinite(source.temperatureC)) next.temperatureC = source.temperatureC;
  if (typeof source.humidityPercent === "number" && Number.isFinite(source.humidityPercent)) next.humidityPercent = source.humidityPercent;
  if (typeof source.illuminanceLx === "number" && Number.isFinite(source.illuminanceLx)) next.illuminanceLx = source.illuminanceLx;
  if (typeof source.co2Ppm === "number" && Number.isFinite(source.co2Ppm)) next.co2Ppm = source.co2Ppm;
  if (typeof source.pressureHpa === "number" && Number.isFinite(source.pressureHpa)) next.pressureHpa = source.pressureHpa;
  if (typeof source.targetC === "number" && Number.isFinite(source.targetC)) next.targetC = source.targetC;
  if (typeof source.mode === "string") next.mode = source.mode;
  if (typeof source.position === "number" && Number.isFinite(source.position)) next.position = source.position;
  if (source.latch === "OPEN" || source.latch === "CLOSED") next.latch = source.latch;
  if (typeof source.detected === "boolean") next.detected = source.detected;
  if (typeof source.watts === "number" && Number.isFinite(source.watts)) next.watts = source.watts;
  if (typeof source.kwh === "number" && Number.isFinite(source.kwh)) next.kwh = source.kwh;
  if (typeof source.windMs === "number" && Number.isFinite(source.windMs)) next.windMs = source.windMs;
  if (typeof source.windDeg === "number" && Number.isFinite(source.windDeg)) next.windDeg = source.windDeg;
  if (typeof source.rainMm === "number" && Number.isFinite(source.rainMm)) next.rainMm = source.rainMm;
  if (typeof source.uvIndex === "number" && Number.isFinite(source.uvIndex)) next.uvIndex = source.uvIndex;
  if (typeof source.radiationUSv === "number" && Number.isFinite(source.radiationUSv)) next.radiationUSv = source.radiationUSv;
  if (typeof source.voltageV === "number" && Number.isFinite(source.voltageV)) next.voltageV = source.voltageV;
  if (typeof source.currentA === "number" && Number.isFinite(source.currentA)) next.currentA = source.currentA;
  if (typeof source.frequencyHz === "number" && Number.isFinite(source.frequencyHz)) next.frequencyHz = source.frequencyHz;
  return next;
}

function channelStatus(value: number | boolean | string | null, lastSeen?: string | null, now = Date.now()): ChannelStatus {
  if (value === null || value === undefined) return "NONE";
  if (lastSeen) {
    const at = Date.parse(lastSeen);
    if (Number.isFinite(at) && now - at > 5 * 60_000) return "STALE";
  }
  return "LIVE";
}

export function applyIngestedChannels(
  device: ChannelHost,
  incoming: { capability?: string | null; externalId?: string; name?: string; value?: unknown }[],
  at: string,
): Capability[] {
  if (!device.channels?.length) persistChannels(device);
  const touched: Capability[] = [];
  for (const row of incoming) {
    const capability =
      normalizeCapabilityName(row.capability) ?? normalizeCapabilityName(row.externalId) ?? normalizeCapabilityName(row.name);
    if (!capability) {
      if (row.externalId) {
        device.metadata ??= {};
        const extra = (device.metadata.unknownChannels as Record<string, unknown> | undefined) ?? {};
        extra[row.externalId] = row.value ?? null;
        device.metadata = { ...device.metadata, unknownChannels: extra };
      }
      continue;
    }
    const current = device.channels?.find((channel) => channel.capability === capability || channel.externalId === row.externalId);
    if (!current) continue;
    if (row.value === undefined) continue;
    current.value = row.value as DeviceChannel["value"];
    current.status = "LIVE";
    current.lastValueAt = at;
    if (row.externalId && !current.externalId) current.externalId = row.externalId;
    touched.push(capability);
  }
  applyChannelsToState(device);
  return [...new Set(touched)];
}

export function markChannelsStale(device: ChannelHost): void {
  if (!device.channels?.length) return;
  for (const channel of device.channels) {
    if (!channel.enabled) continue;
    if (channel.value === null || channel.value === undefined) {
      channel.status = "NONE";
      continue;
    }
    channel.status = "STALE";
  }
}

export function refreshChannelFreshness(device: ChannelHost, now = Date.now()): void {
  if (!device.channels?.length) return;
  for (const channel of device.channels) {
    channel.status = channelStatus(channel.value ?? null, channel.lastValueAt, now);
  }
}

export function synthesizeChannel(device: ChannelHost, capability: Capability, externalId?: string): DeviceChannel {
  const meta = capabilityMeta[capability];
  const value = valueFromState(capability, device.state);
  return {
    id: channelIdFor(device.id, capability),
    deviceId: device.id,
    externalId: externalId?.trim() || capability,
    name: capability,
    displayName: meta.displayName,
    capability,
    unit: meta.unit,
    dataType: meta.dataType,
    readable: true,
    writable: meta.writable,
    value,
    precision: meta.precision,
    enabled: true,
    status: channelStatus(value, device.lastSeen),
    lastValueAt: value === null ? undefined : device.lastSeen ?? undefined,
  };
}

export function synthesizeChannels(device: ChannelHost): DeviceChannel[] {
  const caps = device.capabilities ?? [];
  return caps.map((capability) => synthesizeChannel(device, capability));
}

function asChannel(deviceId: string, raw: unknown, fallback?: DeviceChannel): DeviceChannel | null {
  if (!raw || typeof raw !== "object") return fallback ?? null;
  const row = raw as Record<string, unknown>;
  const capability = normalizeCapabilityName(row.capability) ?? fallback?.capability;
  if (!capability) return null;
  const meta = capabilityMeta[capability];
  const value = row.value === undefined ? (fallback?.value ?? null) : (row.value as DeviceChannel["value"]);
  const enabled = typeof row.enabled === "boolean" ? row.enabled : (fallback?.enabled ?? true);
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : (fallback?.id ?? channelIdFor(deviceId, capability)),
    deviceId,
    externalId:
      typeof row.externalId === "string" && row.externalId.trim()
        ? row.externalId.trim().slice(0, 80)
        : (fallback?.externalId ?? capability),
    name: capability,
    displayName:
      typeof row.displayName === "string" && row.displayName.trim()
        ? row.displayName.trim().slice(0, 80)
        : (fallback?.displayName ?? meta.displayName),
    capability,
    unit: typeof row.unit === "string" ? row.unit.slice(0, 16) : (fallback?.unit ?? meta.unit),
    dataType: meta.dataType,
    readable: row.readable === false ? false : true,
    writable: typeof row.writable === "boolean" ? row.writable : (fallback?.writable ?? meta.writable),
    value: value ?? null,
    min: typeof row.min === "number" ? row.min : fallback?.min,
    max: typeof row.max === "number" ? row.max : fallback?.max,
    precision: typeof row.precision === "number" ? row.precision : (fallback?.precision ?? meta.precision),
    enabled,
    status: fallback?.status ?? channelStatus(value ?? null),
    lastValueAt: fallback?.lastValueAt,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : fallback?.metadata,
  };
}

export function channelsOf(device: ChannelHost): DeviceChannel[] {
  if (device.channels?.length) {
    return device.channels.map((channel) => asChannel(device.id, channel, channel)).filter((item): item is DeviceChannel => Boolean(item));
  }
  return synthesizeChannels(device);
}

export function publicChannelsOf(device: ChannelHost): PublicChannel[] {
  return channelsOf(device)
    .filter((channel) => channel.enabled)
    .map((channel) => {
      const status = channelStatus(channel.value ?? null, channel.lastValueAt ?? device.lastSeen);
      return {
        id: channel.id,
        capability: channel.capability,
        displayName: channel.displayName,
        unit: channel.unit,
        value: channel.value ?? null,
        status,
        quality: qualityOf(status, device.availability),
        writable: channel.writable,
      };
    });
}

export function applyStateToChannels(device: ChannelHost): void {
  if (!device.channels?.length) return;
  for (const channel of device.channels) {
    const value = valueFromState(channel.capability, device.state);
    if (value === null || value === undefined) continue;
    channel.value = value;
    channel.status = channelStatus(value, device.lastSeen);
    channel.lastValueAt = device.lastSeen ?? channel.lastValueAt;
  }
}

export function applyChannelsToState(device: ChannelHost): void {
  if (!device.channels?.length) return;
  const state: ChannelState = { ...device.state };
  for (const channel of device.channels) {
    if (!channel.enabled) continue;
    writeStateFromChannel(state, channel);
  }
  device.state = state;
}

export function persistChannels(device: ChannelHost, input?: unknown): DeviceChannel[] {
  if (Array.isArray(input) && input.length) {
    const next: DeviceChannel[] = [];
    const seen = new Set<Capability>();
    for (const raw of input) {
      const existing = device.channels?.find((channel) => {
        const capability = normalizeCapabilityName((raw as { capability?: unknown }).capability);
        return capability && channel.capability === capability;
      });
      const channel = asChannel(device.id, raw, existing);
      if (!channel || seen.has(channel.capability)) continue;
      seen.add(channel.capability);
      next.push(channel);
    }
    device.channels = next;
    device.capabilities = next.filter((channel) => channel.enabled).map((channel) => channel.capability);
  } else if (!device.channels?.length) {
    device.channels = synthesizeChannels(device);
  }
  applyStateToChannels(device);
  applyChannelsToState(device);
  return device.channels ?? [];
}

export function mergeChannelsForCapabilities(device: ChannelHost, capabilities: Capability[]): DeviceChannel[] {
  const current = channelsOf(device);
  const kept = current.filter((channel) => capabilities.includes(channel.capability));
  const have = new Set(kept.map((channel) => channel.capability));
  for (const capability of capabilities) {
    if (!have.has(capability)) kept.push(synthesizeChannel(device, capability));
  }
  device.channels = kept;
  device.capabilities = capabilities;
  applyStateToChannels(device);
  applyChannelsToState(device);
  return kept;
}

export function deriveLifecycle(device: ChannelHost): DeviceLifecycle {
  if (device.status === "DISABLED" || device.status === "REMOVED" || device.status === "DISCOVERED") return device.status;
  if (device.work === "FAULT") return "ERROR";
  if (device.availability === "OFFLINE") return "OFFLINE";
  const enabled = channelsOf(device).filter((channel) => channel.enabled);
  const live = enabled.filter((channel) => channel.status === "LIVE").length;
  const broken = enabled.filter((channel) => channel.status === "STALE" || channel.status === "ERROR").length;
  if (live && broken) return "DEGRADED";
  if (device.availability === "ONLINE" || device.lastSeen) return "ONLINE";
  if (device.status === "UNCONFIGURED") return "UNCONFIGURED";
  if (device.adapter === "local") return "ONLINE";
  return "UNCONFIGURED";
}

export function findDuplicateDevice<T extends { id: string; gatewayId?: string | null; externalId?: string | null; status?: string }>(
  devices: T[],
  gatewayId: string | null,
  externalId: string | null,
  exceptId?: string,
): T | undefined {
  if (!gatewayId || !externalId) return undefined;
  return devices.find(
    (device) =>
      device.id !== exceptId &&
      device.status !== "REMOVED" &&
      device.gatewayId === gatewayId &&
      device.externalId === externalId,
  );
}
