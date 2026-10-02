import { MetricChip } from "@/components/home/MetricChip";

export type OutdoorWeather = {
  temperatureC: number | null;
  humidityPercent: number | null;
  windMs: number | null;
  radiationUSv: number | null;
  co2Ppm?: number | null;
  organics?: number | null;
  metrics?: { key: string; label: string; icon: string; color: string; value: string }[];
  source?: "REAL" | "DEMO" | "MOCK" | "UNKNOWN";
};

function num(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${String(value).replace(".", ",")}${suffix}`;
}

export function outdoorMetrics(weather?: OutdoorWeather | null, indoor?: { temperatureC: number; humidityPercent: number } | null) {
  if (weather?.metrics?.length) return weather.metrics;
  return [
    { key: "temperature", icon: "thermo", color: "#c2410c", label: "Температура", value: num(weather?.temperatureC ?? indoor?.temperatureC ?? null, "°") },
    { key: "wind", icon: "wind", color: "#0f766e", label: "Ветер", value: num(weather?.windMs ?? null, " м/с") },
    { key: "humidity", icon: "drop", color: "#1d4ed8", label: "Влажность", value: num(weather?.humidityPercent ?? indoor?.humidityPercent ?? null, "%") },
    { key: "radiation", icon: "radiation", color: "#a16207", label: "Радиация", value: num(weather?.radiationUSv ?? null, " мкЗв/ч") },
    { key: "co2", icon: "co2", color: "#15803d", label: "CO₂", value: num(weather?.co2Ppm ?? null, " ppm") },
    { key: "organics", icon: "organics", color: "#6d28d9", label: "Органика", value: num(weather?.organics ?? null, "") },
  ].filter((item): item is { key: string; icon: string; color: string; label: string; value: string } => Boolean(item.value));
}

export function WeatherStrip({
  weather,
  indoor,
  ticker = false,
  onPhoto = false,
}: {
  weather?: OutdoorWeather | null;
  indoor?: { temperatureC: number; humidityPercent: number } | null;
  ticker?: boolean;
  onPhoto?: boolean;
}) {
  const metrics = outdoorMetrics(weather, indoor);

  if (ticker) {
    const loop = metrics.length ? [...metrics, ...metrics] : metrics;
    return (
      <div className={`weather-ticker ${onPhoto ? "weather-ticker-photo" : ""}`} aria-label="Уличные показатели">
        {metrics.length === 0 ? (
          <span className={onPhoto ? "on-photo-muted" : "text-muted"}>Нет данных с уличных датчиков.</span>
        ) : (
          <div className="weather-ticker-track">
            {weather?.source === "DEMO" || weather?.source === "MOCK" ? (
              <span className={onPhoto ? "on-photo-muted" : "text-muted"}>{weather.source === "MOCK" ? "симулятор" : "демо"}</span>
            ) : null}
            {loop.map((item, index) => (
              <MetricChip key={`${item.key}-${index}`} onPhoto={onPhoto} compact icon={item.icon} color={item.color} label={item.label} value={item.value} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="weather-strip" aria-label="Показатели">
      {metrics.length === 0 ? (
        <span>Нет данных с уличных датчиков.</span>
      ) : (
        metrics.map((item) => <MetricChip key={item.key} icon={item.icon} color={item.color} label={item.label} value={item.value} />)
      )}
    </div>
  );
}
