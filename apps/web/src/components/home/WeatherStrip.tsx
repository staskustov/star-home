import { Icon, type IconName } from "@/components/icons";

export type OutdoorWeather = {
  temperatureC: number | null;
  humidityPercent: number | null;
  windMs: number | null;
  radiationUSv: number | null;
  co2Ppm?: number | null;
  organics?: number | null;
  metrics?: { key: string; label: string; icon: string; color: string; value: string }[];
};

const metricIcons = new Set<IconName>(["thermo", "drop", "wind", "radiation", "co2", "organics", "climate", "leak"]);

function num(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${String(value).replace(".", ",")}${suffix}`;
}

function asIcon(name: string): IconName {
  return metricIcons.has(name as IconName) ? (name as IconName) : "thermo";
}

export function WeatherStrip({ weather }: { weather?: OutdoorWeather | null }) {
  const metrics =
    weather?.metrics?.length
      ? weather.metrics
      : [
          { key: "temp", icon: "thermo", color: "#c2410c", label: "Температура", value: num(weather?.temperatureC ?? null, "°") },
          { key: "wind", icon: "wind", color: "#0f766e", label: "Ветер", value: num(weather?.windMs ?? null, " м/с") },
          { key: "humidity", icon: "drop", color: "#1d4ed8", label: "Влажность", value: num(weather?.humidityPercent ?? null, "%") },
          { key: "radiation", icon: "radiation", color: "#a16207", label: "Радиация", value: num(weather?.radiationUSv ?? null, " мкЗв/ч") },
        ].filter((item) => item.value);

  return (
    <div className="weather-strip" aria-label="Показатели">
      {metrics.length === 0 ? (
        <span>Нет данных с уличных датчиков.</span>
      ) : (
        metrics.map((item) => (
          <span key={item.key} className="weather-metric" style={{ color: item.color }}>
            <Icon name={asIcon(item.icon)} className="h-4 w-4 shrink-0" />
            <span>
              {item.label} {item.value}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
