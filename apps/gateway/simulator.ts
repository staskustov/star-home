import type { ApplyCommand, ApplyContext, ApplyResult } from "./apply";
import { expectedState } from "./apply";

const devices = new Map<string, Record<string, unknown>>();

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

export function simulatorState(deviceId: string): Record<string, unknown> | undefined {
  return devices.get(deviceId);
}

export function resetSimulator(): void {
  devices.clear();
}

export async function applySimulator(command: ApplyCommand, ctx: ApplyContext): Promise<ApplyResult> {
  const delay = Number(ctx.simulatorDelayMs ?? process.env.STAR_HOME_SIMULATOR_DELAY_MS ?? 50);
  const fail = ctx.simulatorFail === true || process.env.STAR_HOME_SIMULATOR_FAIL === "1";
  const timeout = ctx.simulatorTimeout === true || process.env.STAR_HOME_SIMULATOR_TIMEOUT === "1";
  const duplicate = process.env.STAR_HOME_SIMULATOR_DUP === "1";
  await sleep(Number.isFinite(delay) ? Math.min(5_000, Math.max(0, delay)) : 50).catch(() => undefined);
  if (fail) return { confirmed: false, sent: true, error: "simulator-fail" };
  if (timeout) return { confirmed: false, sent: true, error: "mqtt-timeout" };
  const state = expectedState(command.command, command.value) ?? {};
  devices.set(command.deviceId, { ...(devices.get(command.deviceId) ?? {}), ...state });
  if (duplicate) {
    devices.set(command.deviceId, { ...(devices.get(command.deviceId) ?? {}), ...state });
  }
  return { confirmed: true, sent: true, state };
}
