export const deviceKinds = [
  "GATE",
  "WICKET",
  "BARRIER",
  "LOCK",
  "CLIMATE",
  "HEATING",
  "LIGHTING",
  "CAMERA",
  "MOTION",
  "LEAK",
  "SMOKE",
  "FIRE",
  "POWER",
  "WATER",
  "IRRIGATION",
  "CURTAIN",
  "WEATHER",
] as const;

export type DeviceKind = (typeof deviceKinds)[number];

const labels: Record<DeviceKind, string> = {
  GATE: "Ворота",
  WICKET: "Калитка",
  BARRIER: "Шлагбаум",
  LOCK: "Замок",
  CLIMATE: "Климат",
  HEATING: "Отопление",
  LIGHTING: "Освещение",
  CAMERA: "Камера",
  MOTION: "Движение",
  LEAK: "Протечка",
  SMOKE: "Дым",
  FIRE: "Пожар",
  POWER: "Электричество",
  WATER: "Вода",
  IRRIGATION: "Полив",
  CURTAIN: "Шторы",
  WEATHER: "Погода",
};

const openers = new Set<DeviceKind>(["GATE", "WICKET", "BARRIER", "LOCK"]);

export function deviceLabel(kind: string): string {
  return kind in labels ? labels[kind as DeviceKind] : "Устройство";
}

export function isOpener(kind: string): boolean {
  return openers.has(kind as DeviceKind);
}

const householdObjectKinds = new Set<DeviceKind>(["GATE", "WICKET", "BARRIER", "LOCK", "WEATHER"]);

export function residentSeesDevice(device: {
  kind: string;
  unitId?: string | null;
  metadata?: { engineering?: unknown } | Record<string, unknown>;
}): boolean {
  if (device.unitId) return true;
  if (device.metadata && "engineering" in device.metadata && device.metadata.engineering === true) return false;
  return householdObjectKinds.has(device.kind as DeviceKind);
}

export function inferKindFromCapabilities(values: readonly string[]): DeviceKind {
  const caps = new Set(values);
  if (caps.has("latch")) return "GATE";
  if (caps.has("wind") || caps.has("radiation")) return "WEATHER";
  if (caps.has("leak")) return "LEAK";
  if (caps.has("smoke")) return "SMOKE";
  if (caps.has("motion") || caps.has("presence")) return "MOTION";
  if (caps.has("position")) return "CURTAIN";
  if (caps.has("brightness") || (caps.has("power") && !caps.has("temperature"))) return "LIGHTING";
  if (caps.has("energy") && !caps.has("temperature")) return "POWER";
  if (caps.has("temperature") || caps.has("humidity") || caps.has("co2") || caps.has("illuminance")) return "CLIMATE";
  return "CLIMATE";
}
