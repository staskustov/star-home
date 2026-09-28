import { Icon, type IconName } from "@/components/icons";

export type MetricStyle = { key: string; label: string; icon: string; color: string; value?: string };

const metricIcons = new Set<IconName>(["thermo", "drop", "wind", "radiation", "co2", "organics", "climate", "leak"]);

export const defaultMetricLooks: Record<string, { icon: IconName; color: string; label: string }> = {
  temperature: { icon: "thermo", color: "#c2410c", label: "Температура" },
  humidity: { icon: "drop", color: "#1d4ed8", label: "Влажность" },
  wind: { icon: "wind", color: "#0f766e", label: "Ветер" },
  radiation: { icon: "radiation", color: "#a16207", label: "Радиация" },
  co2: { icon: "co2", color: "#15803d", label: "CO₂" },
  organics: { icon: "organics", color: "#6d28d9", label: "Органика" },
};

export function asMetricIcon(name: string): IconName {
  return metricIcons.has(name as IconName) ? (name as IconName) : "thermo";
}

export function metricLook(metrics: MetricStyle[] | undefined, key: string) {
  const found = metrics?.find((item) => item.key === key || (key === "temperature" && item.key === "temp"));
  const fallback = defaultMetricLooks[key] ?? defaultMetricLooks.temperature;
  return {
    icon: asMetricIcon(found?.icon ?? fallback.icon),
    color: found?.color ?? fallback.color,
    label: found?.label ?? fallback.label,
  };
}

export function MetricChip({
  icon,
  color,
  label,
  value,
  compact = false,
  onPhoto = false,
}: {
  icon: string;
  color: string;
  label?: string;
  value: string;
  compact?: boolean;
  onPhoto?: boolean;
}) {
  return (
    <span className="weather-metric">
      <span className="inline-flex shrink-0" style={{ color }}>
        <Icon name={asMetricIcon(icon)} className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>
      {label ? <span className={onPhoto ? "on-photo-muted" : "text-ink"}>{label}</span> : null}
      <span style={{ color }}>{value}</span>
    </span>
  );
}
