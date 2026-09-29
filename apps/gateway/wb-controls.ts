/** Native Wiren Board MQTT namespace. Runs on the local agent, not in cloud. */

export type WbTopicValue = { topic: string; value?: unknown };

export type WbDiscoveredChannel = {
  externalId: string;
  capability: string | null;
  displayName: string;
  unit: string;
  value: number | boolean | string | null;
};

export type WbDiscoveredDevice = {
  externalId: string;
  manufacturer: string | null;
  model: string | null;
  online: boolean;
  channels: WbDiscoveredChannel[];
};

const controlMeta: Record<string, { capability: string; unit: string; displayName: string }> = {
  temperature: { capability: "temperature", unit: "°C", displayName: "Температура" },
  temp: { capability: "temperature", unit: "°C", displayName: "Температура" },
  t: { capability: "temperature", unit: "°C", displayName: "Температура" },
  humidity: { capability: "humidity", unit: "%", displayName: "Влажность" },
  illuminance: { capability: "illuminance", unit: "lx", displayName: "Освещенность" },
  illumination: { capability: "illuminance", unit: "lx", displayName: "Освещенность" },
  lux: { capability: "illuminance", unit: "lx", displayName: "Освещенность" },
  co2: { capability: "co2", unit: "ppm", displayName: "CO₂" },
  pressure: { capability: "pressure", unit: "hPa", displayName: "Давление" },
  on: { capability: "power", unit: "", displayName: "Питание" },
  brightness: { capability: "brightness", unit: "%", displayName: "Яркость" },
  target: { capability: "thermostat", unit: "°C", displayName: "Термостат" },
  position: { capability: "position", unit: "%", displayName: "Положение" },
  leak: { capability: "leak", unit: "", displayName: "Протечка" },
  flood: { capability: "leak", unit: "", displayName: "Протечка" },
  waterleak: { capability: "leak", unit: "", displayName: "Протечка" },
  smoke: { capability: "smoke", unit: "", displayName: "Дым" },
  fire: { capability: "smoke", unit: "", displayName: "Дым" },
  motion: { capability: "motion", unit: "", displayName: "Движение" },
  pir: { capability: "motion", unit: "", displayName: "Движение" },
  occupancy: { capability: "presence", unit: "", displayName: "Присутствие" },
  presence: { capability: "presence", unit: "", displayName: "Присутствие" },
};

function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s-]+/g, "").replace("₂", "2");
}

export function parseWirenboardControlTopic(topic: string): { externalId: string; control: string } | null {
  const match = /^\/?devices\/([^/]+)\/controls\/([^/]+)$/i.exec(topic.trim());
  if (!match) return null;
  return { externalId: match[1] ?? "", control: match[2] ?? "" };
}

export function controlCapability(control: string): { capability: string; unit: string; displayName: string } | null {
  return controlMeta[keyOf(control)] ?? null;
}

export function readControlValue(payload: unknown): number | boolean | string | null {
  const raw = payload && typeof payload === "object" && !Array.isArray(payload) && "value" in payload ? (payload as { value: unknown }).value : payload;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string" && (raw === "true" || raw === "false")) return raw === "true";
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function groupWirenboardControls(rows: WbTopicValue[]): WbDiscoveredDevice[] {
  const byId = new Map<string, WbDiscoveredChannel[]>();
  for (const row of rows) {
    const parsed = parseWirenboardControlTopic(row.topic);
    if (!parsed) continue;
    const meta = controlCapability(parsed.control);
    const list = byId.get(parsed.externalId) ?? [];
    list.push({
      externalId: parsed.control,
      capability: meta?.capability ?? null,
      displayName: meta?.displayName ?? parsed.control,
      unit: meta?.unit ?? "",
      value: readControlValue(row.value),
    });
    byId.set(parsed.externalId, list);
  }
  return [...byId.entries()].map(([externalId, channels]) => ({
    externalId,
    manufacturer: /^wb[-_]/i.test(externalId) ? "Wiren Board" : null,
    model: externalId,
    online: true,
    channels,
  }));
}
