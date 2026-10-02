import { Icon } from "@/components/icons";
import { asMetricIcon } from "@/components/home/MetricChip";
import { outdoorMetrics, type OutdoorWeather } from "@/components/home/WeatherStrip";

export function HomeWeatherCard({
  weather,
  indoor,
  aside,
}: {
  weather?: OutdoorWeather | null;
  indoor?: { temperatureC: number; humidityPercent: number } | null;
  aside?: React.ReactNode;
}) {
  const metrics = outdoorMetrics(weather, indoor);
  const temperature = metrics.find((item) => item.key === "temperature" || item.key === "temp");
  const sourceTag = weather?.source === "MOCK" ? "симулятор" : weather?.source === "DEMO" ? "демо" : null;

  return (
    <section aria-label="Уличные показатели" className="weather-card">
      {aside ? <div className="weather-card-aside">{aside}</div> : null}
      <div className="weather-card-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sky-day.jpg" alt="" className="weather-card-day" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sky-night.jpg" alt="" className="weather-card-night" />
        {temperature ? (
          <span className="weather-card-temp">
            <span className="weather-card-temp-icon" style={{ color: temperature.color }}>
              <Icon name={asMetricIcon(temperature.icon)} className="h-5 w-5" />
            </span>
            <span>
              <span className="weather-card-temp-value">{temperature.value}</span>
              <span className="weather-card-temp-label">{temperature.label}</span>
            </span>
          </span>
        ) : null}
        {sourceTag ? (
          <p className="weather-card-caption">
            <span className="weather-card-tag">{sourceTag}</span>
          </p>
        ) : null}
      </div>
      {metrics.length ? (
        <ul className="weather-card-metrics">
          {metrics.map((item) => (
            <li key={item.key} className={`weather-card-metric ${item === temperature ? "is-temp" : ""}`}>
              <span className="weather-card-metric-icon" style={{ color: item.color }}>
                <Icon name={asMetricIcon(item.icon)} className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="weather-card-metric-value">{item.value}</span>
                <span className="weather-card-metric-label">{item.label}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="weather-card-empty">Нет данных с уличных датчиков.</p>
      )}
    </section>
  );
}
