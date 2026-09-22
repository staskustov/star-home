import type { Device } from "@/server/ops-store";
import { readOps, writeOps } from "@/server/ops-store";

export type DeviceCommand = "OPEN" | "READ";

export type DeviceResult = {
  confirmed: boolean;
  reading?: { temperatureC: number; humidityPercent: number };
};

export interface DeviceAdapter {
  execute(device: Device, command: DeviceCommand): Promise<DeviceResult>;
}

class LocalAdapter implements DeviceAdapter {
  async execute(device: Device, command: DeviceCommand): Promise<DeviceResult> {
    if (command === "OPEN" && device.kind === "GATE") return { confirmed: true };
    if (command === "READ" && device.kind === "CLIMATE") {
      const reading = readOps().readings.find((item) => item.deviceId === device.id);
      return reading ? { confirmed: true, reading } : { confirmed: false };
    }
    return { confirmed: false };
  }
}

const adapters: Record<Device["adapter"], DeviceAdapter> = {
  local: new LocalAdapter(),
};

export async function runDevice(device: Device, command: DeviceCommand): Promise<DeviceResult> {
  const adapter = adapters[device.adapter];
  if (!adapter) return { confirmed: false };
  return adapter.execute(device, command);
}

export function gateFor(objectId: string, unitId: string): Device | null {
  const devices = readOps().devices.filter((device) => device.objectId === objectId && device.kind === "GATE");
  return devices.find((device) => device.unitId === unitId) ?? devices.find((device) => device.unitId === null) ?? null;
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
