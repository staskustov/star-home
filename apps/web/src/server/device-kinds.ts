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
};

const openers = new Set<DeviceKind>(["GATE", "WICKET", "BARRIER", "LOCK"]);

export function deviceLabel(kind: string): string {
  return kind in labels ? labels[kind as DeviceKind] : "Устройство";
}

export function isOpener(kind: string): boolean {
  return openers.has(kind as DeviceKind);
}
