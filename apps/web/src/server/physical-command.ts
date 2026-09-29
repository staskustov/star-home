import { cloudExecutesAdapter, executeOnAdapter } from "@/server/gateway-adapter";
import { enqueueGatewayCommand } from "@/server/gateway-queue";
import {
  applyStateToChannels,
  deriveLifecycle,
  persistChannels,
} from "@/server/device-channels";
import { findGateway, readOps, writeOps, type Device, type NormalizedState } from "@/server/ops-store";
import { commandLifecycleOf, type CommandLifecycle } from "@/server/command-lifecycle";

export type PhysicalCommandStatus = "accepted" | "queued" | "confirmed" | "failed";

export type PhysicalCommandResult = {
  confirmed: boolean;
  status: PhysicalCommandStatus;
  lifecycle: CommandLifecycle;
  commandId?: string;
  error?: string;
  state?: NormalizedState;
  message: string;
};

function applyLocalState(deviceId: string, state: NormalizedState | undefined, confirmed: boolean): void {
  if (!confirmed || !state) return;
  const file = readOps();
  const current = file.devices.find((item) => item.id === deviceId);
  if (!current) return;
  const now = new Date().toISOString();
  current.state = { ...current.state, ...state };
  if (state.latch) current.latch = state.latch;
  current.lastSeen = now;
  current.availability = "ONLINE";
  current.updatedAt = now;
  if (!current.channels?.length) persistChannels(current);
  applyStateToChannels(current);
  current.status = deriveLifecycle(current);
  writeOps(file);
}

export async function dispatchPhysicalCommand(device: Device, command: string, value?: unknown): Promise<PhysicalCommandResult> {
  const gateway = device.gatewayId ? findGateway(device.gatewayId) : undefined;
  const remote = Boolean(gateway && !cloudExecutesAdapter(gateway.adapter));
  if (remote && gateway) {
    const queued = enqueueGatewayCommand({
      gatewayId: gateway.id,
      deviceId: device.id,
      command,
      value,
    });
    const offline = gateway.status === "OFFLINE";
    return {
      confirmed: false,
      status: offline ? "queued" : "accepted",
      lifecycle: "ACCEPTED",
      commandId: queued.id,
      error: offline ? "gateway-offline" : "awaiting-gateway",
      message: offline
        ? "Контроллер недоступен. Команда в очереди."
        : "Команда принята. Ожидаем подтверждение оборудования.",
    };
  }

  const result = await executeOnAdapter(device, command, value);
  applyLocalState(device.id, result.state, result.confirmed);
  if (result.confirmed) {
    return {
      confirmed: true,
      status: "confirmed",
      lifecycle: "CONFIRMED",
      state: result.state,
      message: "Команда выполнена.",
    };
  }
  if (result.error === "demo-adapter-forbidden") {
    return {
      confirmed: false,
      status: "failed",
      lifecycle: "FAILED",
      error: result.error,
      message: "Демо-адаптер запрещён в production.",
    };
  }
  if (result.error === "gateway-offline") {
    return {
      confirmed: false,
      status: "queued",
      lifecycle: "ACCEPTED",
      error: result.error,
      message: "Контроллер недоступен. Команда в очереди.",
    };
  }
  return {
    confirmed: false,
    status: "failed",
    lifecycle: result.error === "mqtt-timeout" ? "TIMEOUT" : "FAILED",
    error: result.error,
    message: "Не удалось подтвердить выполнение.",
  };
}

export function lifecycleFromQueue(status: string | undefined, error?: string | null): CommandLifecycle {
  return commandLifecycleOf(status, error);
}
