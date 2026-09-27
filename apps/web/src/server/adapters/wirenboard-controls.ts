import { displayNameForCapability, normalizeCapabilityName, unitForCapability } from "@/server/device-channels";
import type { Capability } from "@/server/device-capabilities";
import type { NormalizedState } from "@/server/ops-store";

export type WirenboardTopicValue = { topic: string; value?: unknown };

export type DiscoveredChannelView = {
  externalId: string;
  capability: Capability | null;
  displayName: string;
  unit: string;
  value: number | boolean | string | null;
};

export type DiscoveredDeviceView = {
  externalId: string;
  manufacturer: string | null;
  model: string | null;
  online: boolean;
  channels: DiscoveredChannelView[];
};

export function parseWirenboardControlTopic(topic: string): { externalId: string; control: string } | null {
  const match = /^\/?devices\/([^/]+)\/controls\/([^/]+)$/i.exec(topic.trim());
  if (!match) return null;
  return { externalId: match[1] ?? "", control: match[2] ?? "" };
}

function readValue(payload: unknown): number | boolean | string | null {
  const raw = payload && typeof payload === "object" && !Array.isArray(payload) && "value" in payload ? (payload as { value: unknown }).value : payload;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string" && (raw === "true" || raw === "false")) return raw === "true";
  if (typeof raw === "number" && Number.isFinite(raw)) return Number(raw);
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function mapWirenboardControl(topic: string, payload?: unknown): { externalId: string; channel: DiscoveredChannelView } | null {
  const parsed = parseWirenboardControlTopic(topic);
  if (!parsed) return null;
  const capability = normalizeCapabilityName(parsed.control);
  return {
    externalId: parsed.externalId,
    channel: {
      externalId: parsed.control,
      capability,
      displayName: capability ? displayNameForCapability(capability) : parsed.control,
      unit: capability ? unitForCapability(capability) : "",
      value: readValue(payload),
    },
  };
}

export function groupWirenboardDiscovery(rows: WirenboardTopicValue[]): DiscoveredDeviceView[] {
  const byId = new Map<string, DiscoveredChannelView[]>();
  for (const row of rows) {
    const mapped = mapWirenboardControl(row.topic, row.value);
    if (!mapped) continue;
    const list = byId.get(mapped.externalId) ?? [];
    list.push(mapped.channel);
    byId.set(mapped.externalId, list);
  }
  return [...byId.entries()].map(([externalId, channels]) => ({
    externalId,
    manufacturer: /^wb[-_]/i.test(externalId) ? "Wiren Board" : null,
    model: externalId,
    online: true,
    channels,
  }));
}

export function channelValueToState(capability: Capability | null, value: number | boolean | string | null): NormalizedState {
  const state: NormalizedState = {};
  if (value === null || value === undefined || !capability) return state;
  if (capability === "temperature" && typeof value === "number") state.temperatureC = value;
  if (capability === "humidity" && typeof value === "number") state.humidityPercent = value;
  if (capability === "illuminance" && typeof value === "number") state.illuminanceLx = value;
  if (capability === "co2" && typeof value === "number") state.co2Ppm = value;
  if (capability === "pressure" && typeof value === "number") state.pressureHpa = value;
  if (capability === "thermostat" && typeof value === "number") state.targetC = value;
  if (capability === "brightness" && typeof value === "number") state.brightness = value;
  if (capability === "position" && typeof value === "number") state.position = value;
  if (capability === "power" && typeof value === "boolean") state.on = value;
  if (capability === "latch" && (value === "OPEN" || value === "CLOSED")) state.latch = value;
  return state;
}

export function topicsFromUnknown(raw: unknown): WirenboardTopicValue[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") return { topic: item };
        if (item && typeof item === "object" && typeof (item as { topic?: unknown }).topic === "string") {
          return { topic: (item as { topic: string }).topic, value: (item as { value?: unknown }).value };
        }
        return null;
      })
      .filter((item): item is WirenboardTopicValue => Boolean(item));
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).map(([topic, value]) => ({ topic, value }));
  }
  return [];
}
