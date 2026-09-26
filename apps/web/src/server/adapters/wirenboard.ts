import { registerGatewayAdapter, type AdapterResult, type GatewayAdapter } from "@/server/gateway-adapter";
import { applyCommandState, isSmartCommand } from "@/server/smart-commands";
import type { Device, NormalizedState } from "@/server/ops-store";

type WbPayload = { value?: unknown; on?: boolean; brightness?: number; temperature?: number; position?: number };

export function wirenboardTopic(externalId: string, command: string): string {
  const leaf =
    command === "setPower" || command === "open" || command === "close"
      ? "on"
      : command === "setBrightness"
        ? "brightness"
        : command === "setTemperature" || command === "setHvacMode"
          ? "target"
          : command === "setPosition" || command === "stop"
            ? "position"
            : "command";
  return `wb/${externalId}/${leaf}`;
}

export function wirenboardPayload(command: string, value: unknown): WbPayload {
  if (command === "setPower") return { on: Boolean(value) };
  if (command === "open") return { on: true };
  if (command === "close") return { on: false };
  if (command === "setBrightness") return { brightness: Number(value) };
  if (command === "setTemperature") return { temperature: Number(value) };
  if (command === "setPosition") return { position: Number(value) };
  return { value };
}

export function mapWirenboardInbound(topic: string, payload: unknown): { externalId: string; state: NormalizedState } | null {
  const match = /^wb\/([^/]+)\/(on|brightness|target|position|temperature|humidity)$/.exec(topic);
  if (!match) return null;
  const [, externalId, leaf] = match;
  const body = (payload && typeof payload === "object" ? payload : { value: payload }) as WbPayload & { humidity?: number };
  const state: NormalizedState = {};
  if (leaf === "on") state.on = Boolean(body.on ?? body.value);
  if (leaf === "brightness" && Number.isFinite(Number(body.brightness ?? body.value))) state.brightness = Number(body.brightness ?? body.value);
  if (leaf === "target" && Number.isFinite(Number(body.temperature ?? body.value))) state.targetC = Number(body.temperature ?? body.value);
  if (leaf === "temperature" && Number.isFinite(Number(body.temperature ?? body.value))) state.temperatureC = Number(body.temperature ?? body.value);
  if (leaf === "humidity" && Number.isFinite(Number(body.humidity ?? body.value))) state.humidityPercent = Number(body.humidity ?? body.value);
  if (leaf === "position" && Number.isFinite(Number(body.position ?? body.value))) state.position = Number(body.position ?? body.value);
  return { externalId: externalId ?? "", state };
}

class WirenBoardAdapter implements GatewayAdapter {
  readonly kind = "wirenboard";

  async execute(device: Device, command: string, value: unknown): Promise<AdapterResult> {
    if (!device.externalId) return { confirmed: false, error: "no-external-id" };
    const broker = process.env.STAR_HOME_WB_MQTT_URL;
    if (!broker) return { confirmed: false, error: "broker-unconfigured" };
    const mapped = wirenboardTopic(device.externalId, command);
    if (!mapped.startsWith("wb/")) return { confirmed: false, error: "bad-topic" };
    if (broker.startsWith("mqtt://127.0.0.1") || broker.startsWith("mqtt://localhost")) {
      return {
        confirmed: false,
        error: "broker-offline",
        state: isSmartCommand(command) ? applyCommandState(device.state, command, value) : undefined,
      };
    }
    return { confirmed: false, error: "broker-forbidden" };
  }

  mapInbound(topic: string, payload: unknown) {
    return mapWirenboardInbound(topic, payload);
  }
}

export const wirenBoardAdapter = new WirenBoardAdapter();

registerGatewayAdapter(wirenBoardAdapter);
registerGatewayAdapter({
  kind: "mqtt",
  execute: (device, command, value) => wirenBoardAdapter.execute(device, command, value),
  mapInbound: (topic, payload) => wirenBoardAdapter.mapInbound(topic, payload),
});
