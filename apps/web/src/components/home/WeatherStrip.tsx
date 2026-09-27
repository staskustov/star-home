import { Icon } from "@/components/icons";

export type OutdoorWeather = {
  temperatureC: number | null;
  humidityPercent: number | null;
  windMs: number | null;
  radiationUSv: number | null;
};

function num(value: number | null, suffix: string) {
  if (value === null || !Number.isFinite(value)) return null;
  return `${String(value).replace(".", ",")}${suffix}`;
}

export function WeatherStrip({ weather }: { weather?: OutdoorWeather | null }) {
  const metrics = [
    { key: "temp", icon: "thermo" as const, label: "Температура", value: num(weather?.temperatureC ?? null, "°") },
    { key: "wind", icon: "wind" as const, label: "Ветер", value: num(weather?.windMs ?? null, " м/с") },
    { key: "humidity", icon: "drop" as const, label: "Влажность", value: num(weather?.humidityPercent ?? null, "%") },
    { key: "radiation", icon: "radiation" as const, label: "Радиация", value: num(weather?.radiationUSv ?? null, " мкЗв/ч") },
  ].filter((item) => item.value);

  return (
    <div className="weather-strip" aria-label="Погода на улице">
      {metrics.length === 0 ? (
        <span>Нет данных с уличных датчиков.</span>
      ) : (
        metrics.map((item) => (
          <span key={item.key} className="weather-metric">
            <Icon name={item.icon} className="h-4 w-4 shrink-0" />
            <span>
              {item.label} {item.value}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
