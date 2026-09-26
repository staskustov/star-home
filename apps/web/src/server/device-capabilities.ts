import type { DeviceKind } from "@/server/device-kinds";

export const capabilities = [
  "power",
  "brightness",
  "temperature",
  "humidity",
  "thermostat",
  "position",
  "latch",
  "motion",
  "leak",
  "smoke",
  "contact",
  "energy",
] as const;

export type Capability = (typeof capabilities)[number];

const byKind: Partial<Record<DeviceKind, readonly Capability[]>> = {
  LIGHTING: ["power", "brightness"],
  CLIMATE: ["temperature", "humidity", "thermostat"],
  HEATING: ["thermostat"],
  CURTAIN: ["position"],
  GATE: ["latch"],
  WICKET: ["latch"],
  BARRIER: ["latch"],
  LOCK: ["latch"],
  MOTION: ["motion"],
  LEAK: ["leak"],
  SMOKE: ["smoke"],
  FIRE: ["smoke"],
  POWER: ["power", "energy"],
  WATER: ["energy"],
  IRRIGATION: ["power"],
};

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (capabilities as readonly string[]).includes(value);
}

export function capabilitiesFor(kind: string): Capability[] {
  return [...(byKind[kind as DeviceKind] ?? [])];
}

export function cleanCapabilities(value: unknown, kind: string): Capability[] {
  if (!Array.isArray(value)) return capabilitiesFor(kind);
  const unique = new Set<Capability>();
  for (const item of value) if (isCapability(item)) unique.add(item);
  return unique.size ? [...unique] : capabilitiesFor(kind);
}
