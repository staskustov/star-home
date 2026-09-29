import type { GatewayCommand } from "@/server/ops-store";
import type { CommandLifecycle } from "@/server/runtime-mode";

export type { CommandLifecycle };

export function commandLifecycleOf(status: string | undefined, error?: string | null): CommandLifecycle {
  if (status === "PENDING") return "ACCEPTED";
  if (status === "SENT") return "DELIVERED";
  if (status === "ACKED") return "CONFIRMED";
  if (status === "EXPIRED") return "TIMEOUT";
  if (status === "FAILED") {
    const text = error ?? "";
    if (text.includes("timeout") || text.includes("EXPIRED")) return "TIMEOUT";
    return "FAILED";
  }
  return "FAILED";
}

export function commandLifecycle(row: Pick<GatewayCommand, "status"> & { error?: string }): CommandLifecycle {
  return commandLifecycleOf(row.status, row.error);
}

export function stateMatchesCommand(command: string, value: unknown, state: Record<string, unknown> | undefined): boolean {
  if (!state) return false;
  if (command === "setPower") {
    const want = !(value === false || value === 0 || value === "0");
    return state.on === want;
  }
  if (command === "open") return state.latch === "OPEN";
  if (command === "close") return state.latch === "CLOSED";
  if (command === "setBrightness") {
    const brightness = Number(value);
    return Number.isFinite(brightness) && state.brightness === Math.min(100, Math.max(0, Math.round(brightness)));
  }
  if (command === "setTemperature") {
    const target = Number(value);
    return Number.isFinite(target) && state.targetC === Math.round(target * 10) / 10;
  }
  if (command === "setPosition") {
    const position = Number(value);
    return Number.isFinite(position) && state.position === Math.min(100, Math.max(0, Math.round(position)));
  }
  return false;
}
