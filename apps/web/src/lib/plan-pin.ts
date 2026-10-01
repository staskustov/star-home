export type PlanMetric = {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: string;
};

export type PlanPin = {
  deviceId: string;
  name: string;
  x: number;
  y: number;
  kind: string;
  icon?: string | null;
  iconColor?: string | null;
  on: boolean | null;
  canToggle: boolean;
  metrics: PlanMetric[];
};

export type PlanPinSource = {
  id: string;
  name?: string;
  displayName?: string;
  kind: string;
  kindCode?: string;
  icon?: string | null;
  iconColor?: string | null;
  planX: number;
  planY: number;
  capabilities?: string[];
  channels?: {
    capability: string;
    displayName?: string;
    unit?: string;
    value?: number | boolean | string | null;
    enabled?: boolean;
  }[];
  state?: {
    on?: boolean;
    temperatureC?: number;
    humidityPercent?: number;
    co2Ppm?: number;
    pressureHpa?: number;
    illuminanceLx?: number;
    windMs?: number;
    radiationUSv?: number;
  };
};

const sensorLooks: Record<string, { icon: string; color: string; label: string; precision: number; suffix: string; stateKey?: keyof NonNullable<PlanPinSource["state"]> }> = {
  temperature: { icon: "thermo", color: "#c2410c", label: "Температура", precision: 1, suffix: "°", stateKey: "temperatureC" },
  humidity: { icon: "drop", color: "#1d4ed8", label: "Влажность", precision: 0, suffix: "%", stateKey: "humidityPercent" },
  co2: { icon: "co2", color: "#15803d", label: "CO₂", precision: 0, suffix: " ppm", stateKey: "co2Ppm" },
  pressure: { icon: "climate", color: "#0f766e", label: "Давление", precision: 0, suffix: " гПа", stateKey: "pressureHpa" },
  illuminance: { icon: "light", color: "#a16207", label: "Освещенность", precision: 0, suffix: " лк", stateKey: "illuminanceLx" },
  wind: { icon: "wind", color: "#0f766e", label: "Ветер", precision: 1, suffix: " м/с", stateKey: "windMs" },
  radiation: { icon: "radiation", color: "#a16207", label: "Радиация", precision: 2, suffix: " мкЗв/ч", stateKey: "radiationUSv" },
};

export function isLightingKind(kind: string) {
  return kind === "LIGHTING" || kind === "Освещение";
}

export function isClimateKind(kind: string) {
  return kind === "CLIMATE" || kind === "Климат" || kind === "WEATHER";
}

export function isCameraKind(kind: string) {
  return kind === "CAMERA" || kind === "Камера";
}

function formatMetric(value: number, precision: number, suffix: string) {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
  return `${formatted}${suffix}`;
}

function numberFrom(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function planPinOf(device: PlanPinSource): PlanPin {
  const kind = device.kindCode ?? device.kind;
  const lighting = isLightingKind(kind);
  const power = device.channels?.find((channel) => channel.capability === "power");
  const on = lighting ? (typeof power?.value === "boolean" ? power.value : Boolean(device.state?.on)) : null;
  const canToggle = lighting;
  const metrics: PlanMetric[] = [];
  if (!lighting) {
    for (const [key, look] of Object.entries(sensorLooks)) {
      const channel = device.channels?.find((item) => item.capability === key && item.enabled !== false);
      const fromChannel = numberFrom(channel?.value);
      const fromState = look.stateKey ? numberFrom(device.state?.[look.stateKey]) : null;
      const value = fromChannel ?? fromState;
      if (value == null) continue;
      metrics.push({
        key,
        label: look.label,
        icon: look.icon,
        color: look.color,
        value: formatMetric(value, look.precision, look.suffix),
      });
    }
  }
  return {
    deviceId: device.id,
    name: device.displayName ?? device.name ?? "",
    x: device.planX,
    y: device.planY,
    kind,
    icon: device.icon ?? null,
    iconColor: device.iconColor ?? null,
    on,
    canToggle,
    metrics,
  };
}
