import { appendAudit } from "@/server/audit-store";
import { isOpener } from "@/server/device-kinds";
import { applyCommandState, type SmartCommandName } from "@/server/smart-commands";
import { readOps, writeOps, type Device, type Gateway, type GatewayAdapterKind, type NormalizedState } from "@/server/ops-store";
import { expireStaleGateways } from "@/server/gateway-contact";
import { demoExecutionAllowed } from "@/server/runtime-mode";

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

export function cloudExecutesAdapter(kind: string | null | undefined): boolean {
  return kind === "local" || kind === "http";
}

export class LocalGatewayAdapter implements GatewayAdapter {
  readonly kind = "local";

  async execute(device: Device, command: string, value: unknown): Promise<AdapterResult> {
    if (!demoExecutionAllowed()) {
      appendAudit({
        actorUserId: "system",
        companyId: device.companyId,
        objectId: device.objectId,
        unitId: device.unitId,
        action: "DEMO_ADAPTER_FORBIDDEN",
        targetType: "device",
        targetId: device.id,
        target: device.name,
        result: "ERROR",
        reason: `command=${command}; adapter=local; production demo adapter blocked`,
      });
      return { confirmed: false, error: "demo-adapter-forbidden" };
    }
    const gateway = device.gatewayId ? readOps().gateways.find((item) => item.id === device.gatewayId) : undefined;
    if (!cloudExecutesAdapter(device.adapter) || (gateway && !cloudExecutesAdapter(gateway.adapter))) {
      return { confirmed: false, error: "local-forbidden-on-paired-gateway" };
    }
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
  const kind = gateway?.adapter ?? device.adapter;
  const found = byKind.get(kind);
  if (found) return found;
  if (kind === "http" || device.adapter === "http") return httpAdapter;
  if (kind && !cloudExecutesAdapter(kind)) {
    return {
      kind,
      async execute(): Promise<AdapterResult> {
        return { confirmed: false, error: "adapter-unconfigured" };
      },
    };
  }
  return localAdapter;
}

export function knownGatewayAdapters(): GatewayAdapterKind[] {
  return [...byKind.keys()] as GatewayAdapterKind[];
}

export async function executeOnAdapter(device: Device, command: string, value: unknown): Promise<AdapterResult> {
  const file = readOps();
  if (expireStaleGateways(file)) writeOps(file);
  const gateway = device.gatewayId ? readOps().gateways.find((item) => item.id === device.gatewayId) : undefined;
  const kind = gateway?.adapter ?? device.adapter;
  if (gateway?.status === "OFFLINE" && gateway.adapter !== "local") {
    return { confirmed: false, error: "gateway-offline" };
  }
  if (!cloudExecutesAdapter(kind)) {
    return { confirmed: false, error: "awaiting-gateway" };
  }
  return adapterFor(device, gateway).execute(device, command, value);
}
