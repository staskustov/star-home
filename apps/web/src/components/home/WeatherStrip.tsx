import { MetricChip } from "@/components/home/MetricChip";

export type OutdoorWeather = {
  temperatureC: number | null;
  humidityPercent: number | null;
  windMs: number | null;
  radiationUSv: number | null;
  co2Ppm?: number | null;
  organics?: number | null;
  metrics?: { key: string; label: string; icon: string; color: string; value: string }[];
};

function num(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${String(value).replace(".", ",")}${suffix}`;
}

export function WeatherStrip({ weather }: { weather?: OutdoorWeather | null }) {
  const metrics =
    weather?.metrics?.length
      ? weather.metrics
      : [
          { key: "temperature", icon: "thermo", color: "#c2410c", label: "Температура", value: num(weather?.temperatureC ?? null, "°") },
          { key: "wind", icon: "wind", color: "#0f766e", label: "Ветер", value: num(weather?.windMs ?? null, " м/с") },
          { key: "humidity", icon: "drop", color: "#1d4ed8", label: "Влажность", value: num(weather?.humidityPercent ?? null, "%") },
          { key: "radiation", icon: "radiation", color: "#a16207", label: "Радиация", value: num(weather?.radiationUSv ?? null, " мкЗв/ч") },
        ].filter((item): item is { key: string; icon: string; color: string; label: string; value: string } => Boolean(item.value));

  return (
    <div className="weather-strip" aria-label="Показатели">
      {metrics.length === 0 ? (
        <span>Нет данных с уличных датчиков.</span>
      ) : (
        metrics.map((item) => (
          <MetricChip key={item.key} icon={item.icon} color={item.color} label={item.label} value={item.value} />
        ))
      )}
    </div>
  );
}
