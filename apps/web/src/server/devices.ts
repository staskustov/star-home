import { isOpener } from "@/server/device-kinds";
import type { Device } from "@/server/ops-store";
import { readOps, writeOps } from "@/server/ops-store";

export type DeviceCommand = "OPEN" | "CLOSE" | "READ";

export type DeviceResult = {
  confirmed: boolean;
  reading?: { temperatureC: number; humidityPercent: number };
};

export async function runDevice(device: Device, command: DeviceCommand): Promise<DeviceResult> {
  const { executeOnAdapter } = await import("./gateway-adapter");
  const mapped = command === "OPEN" ? "open" : command === "CLOSE" ? "close" : command;
  const result = await executeOnAdapter(device, mapped, undefined);
  return {
    confirmed: result.confirmed,
    reading:
      result.state?.temperatureC != null && result.state.humidityPercent != null
        ? { temperatureC: result.state.temperatureC, humidityPercent: result.state.humidityPercent }
        : undefined,
  };
}

export function gateFor(objectId: string, unitId: string): Device | null {
  const devices = readOps().devices.filter((device) => device.objectId === objectId && device.kind === "GATE");
  return devices.find((device) => device.unitId === unitId) ?? devices.find((device) => device.unitId === null) ?? null;
}

export function accessPoint(objectId: string, unitId: string, pointId: string): Device | null {
  const device = readOps().devices.find((item) => item.id === pointId && item.objectId === objectId);
  if (!device || !isOpener(device.kind)) return null;
  if (device.unitId !== null && device.unitId !== unitId) return null;
  return device;
}

export function rememberReading(deviceId: string, temperatureC: number, humidityPercent: number): void {
  const file = readOps();
  const current = file.readings.find((item) => item.deviceId === deviceId);
  if (current) {
    current.temperatureC = temperatureC;
    current.humidityPercent = humidityPercent;
  } else file.readings.push({ deviceId, temperatureC, humidityPercent });
  writeOps(file);
}
