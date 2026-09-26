import { isOpener } from "@/server/device-kinds";
import { applyCommandState, type SmartCommandName } from "@/server/smart-commands";
import { readOps, type Device, type Gateway, type GatewayAdapterKind, type NormalizedState } from "@/server/ops-store";

export type AdapterResult = {
  confirmed: boolean;
  state?: NormalizedState;
  error?: string;
};

export interface GatewayAdapter {
  readonly kind: string;
  execute(device: Device, command: string, value: unknown): Promise<AdapterResult>;
  mapInbound?(topic: string, payload: unknown): { externalId: string; state: NormalizedState } | null;
}

export class LocalGatewayAdapter implements GatewayAdapter {
  readonly kind = "local";

  async execute(device: Device, command: string, value: unknown): Promise<AdapterResult> {
    if ((command === "OPEN" || command === "open" || command === "CLOSE" || command === "close") && isOpener(device.kind)) {
      return { confirmed: true, state: { latch: command === "OPEN" || command === "open" ? "OPEN" : "CLOSED" } };
    }
    if (command === "READ" && device.kind === "CLIMATE") {
      const reading = readOps().readings.find((item) => item.deviceId === device.id);
      return reading ? { confirmed: true, state: { temperatureC: reading.temperatureC, humidityPercent: reading.humidityPercent } } : { confirmed: false };
    }
    if (command === "setPower" || command === "setBrightness" || command === "setTemperature" || command === "setHvacMode" || command === "setPosition" || command === "open" || command === "close" || command === "stop") {
      return { confirmed: true, state: applyCommandState(device.state, command as SmartCommandName, value) };
    }
    return { confirmed: false };
  }
}

export class HttpGatewayAdapter implements GatewayAdapter {
  readonly kind = "http";

  async execute(device: Device, command: string, value: unknown): Promise<AdapterResult> {
    if (!device.endpoint) return { confirmed: false, error: "no-endpoint" };
    const response = await fetch(device.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, value, kind: device.kind }),
    }).catch(() => null);
    if (!response?.ok) return { confirmed: false, error: "unreachable" };
    const payload = (await response.json().catch(() => null)) as { confirmed?: boolean; state?: NormalizedState } | null;
    return { confirmed: Boolean(payload?.confirmed), state: payload?.state };
  }
}

const localAdapter = new LocalGatewayAdapter();
const httpAdapter = new HttpGatewayAdapter();

const byKind = new Map<string, GatewayAdapter>([
  ["local", localAdapter],
  ["http", httpAdapter],
]);

export function registerGatewayAdapter(adapter: GatewayAdapter): void {
  byKind.set(adapter.kind, adapter);
}

export function adapterFor(device: Device, gateway?: Gateway | null): GatewayAdapter {
  if (gateway && byKind.has(gateway.adapter)) return byKind.get(gateway.adapter) ?? localAdapter;
  if (device.adapter === "http") return httpAdapter;
  return byKind.get(device.adapter) ?? localAdapter;
}

export function knownGatewayAdapters(): GatewayAdapterKind[] {
  return [...byKind.keys()] as GatewayAdapterKind[];
}

export async function executeOnAdapter(device: Device, command: string, value: unknown): Promise<AdapterResult> {
  const gateway = device.gatewayId ? readOps().gateways.find((item) => item.id === device.gatewayId) : undefined;
  if (gateway?.status === "OFFLINE" && gateway.adapter !== "local") {
    return { confirmed: false, error: "gateway-offline" };
  }
  return adapterFor(device, gateway).execute(device, command, value);
}
