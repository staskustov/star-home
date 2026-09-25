import { isOpener } from "@/server/device-kinds";
import type { Device } from "@/server/ops-store";
import { readOps, writeOps } from "@/server/ops-store";

export type DeviceCommand = "OPEN" | "CLOSE" | "READ";

export type DeviceResult = {
  confirmed: boolean;
  reading?: { temperatureC: number; humidityPercent: number };
};

export interface DeviceAdapter {
  execute(device: Device, command: DeviceCommand): Promise<DeviceResult>;
}

class LocalAdapter implements DeviceAdapter {
  async execute(device: Device, command: DeviceCommand): Promise<DeviceResult> {
    if ((command === "OPEN" || command === "CLOSE") && isOpener(device.kind)) return { confirmed: true };
    if (command === "READ" && device.kind === "CLIMATE") {
      const reading = readOps().readings.find((item) => item.deviceId === device.id);
      return reading ? { confirmed: true, reading } : { confirmed: false };
    }
    return { confirmed: false };
  }
}

class HttpAdapter implements DeviceAdapter {
  async execute(device: Device, command: DeviceCommand): Promise<DeviceResult> {
    if (!device.endpoint) return { confirmed: false };
    const response = await fetch(device.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, kind: device.kind }),
    }).catch(() => null);
    if (!response?.ok) return { confirmed: false };
    const payload = (await response.json().catch(() => null)) as { confirmed?: boolean } | null;
    return { confirmed: Boolean(payload?.confirmed) };
  }
}

const http = new HttpAdapter();

const adapters: Record<Device["adapter"], DeviceAdapter> = {
  local: new LocalAdapter(),
  http,
  matter: http,
  mqtt: http,
  modbus: http,
  onvif: http,
  rs485: http,
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
