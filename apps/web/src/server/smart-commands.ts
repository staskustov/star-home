import { isOpener } from "@/server/device-kinds";
import type { Capability } from "@/server/device-capabilities";
import type { Device, NormalizedState } from "@/server/ops-store";

export const smartCommands = [
  "setPower",
  "setBrightness",
  "setTemperature",
  "setHvacMode",
  "setPosition",
  "open",
  "close",
  "stop",
] as const;

export type SmartCommandName = (typeof smartCommands)[number];
export type CommandRisk = "LOW" | "MEDIUM" | "HIGH";

export function isSmartCommand(value: unknown): value is SmartCommandName {
  return typeof value === "string" && (smartCommands as readonly string[]).includes(value);
}

export function commandRisk(command: SmartCommandName, device: Device): CommandRisk {
  if ((command === "open" || command === "close") && (isOpener(device.kind) || device.capabilities?.includes("latch"))) return "HIGH";
  if ((device.kind === "WATER" || device.kind === "IRRIGATION") && (command === "setPower" || command === "open" || command === "close")) {
    return "HIGH";
  }
  if (command === "setTemperature" || command === "setHvacMode") return "MEDIUM";
  return "LOW";
}

export function commandNeeds(command: SmartCommandName): Capability[] {
  if (command === "setPower") return ["power"];
  if (command === "setBrightness") return ["brightness"];
  if (command === "setTemperature" || command === "setHvacMode") return ["thermostat"];
  if (command === "setPosition" || command === "stop") return ["position"];
  return ["position", "latch"];
}

export function deviceCan(device: Device, command: SmartCommandName): boolean {
  const caps = device.capabilities ?? [];
  return commandNeeds(command).some((item) => caps.includes(item));
}

export function applyCommandState(state: NormalizedState | undefined, command: SmartCommandName, value: unknown): NormalizedState {
  const next = { ...state };
  if (command === "setPower") next.on = Boolean(value);
  if (command === "setBrightness") {
    const brightness = Number(value);
    if (Number.isFinite(brightness)) next.brightness = Math.min(100, Math.max(0, Math.round(brightness)));
    next.on = (next.brightness ?? 0) > 0;
  }
  if (command === "setTemperature") {
    const target = Number(value);
    if (Number.isFinite(target)) next.targetC = Math.round(target * 10) / 10;
  }
  if (command === "setHvacMode" && typeof value === "string") next.mode = value;
  if (command === "setPosition") {
    const position = Number(value);
    if (Number.isFinite(position)) next.position = Math.min(100, Math.max(0, Math.round(position)));
  }
  if (command === "open") {
    if (next.latch !== undefined) next.latch = "OPEN";
    if (next.position !== undefined) next.position = 100;
    if (next.latch === undefined && next.position === undefined) next.latch = "OPEN";
  }
  if (command === "close") {
    next.latch = "CLOSED";
    if (next.position !== undefined) next.position = 0;
  }
  return next;
}
