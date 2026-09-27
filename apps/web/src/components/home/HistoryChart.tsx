import { formatChannelValue } from "@/lib/format";

export type HistoryPoint = {
  at: string;
  capability?: string;
  unit?: string;
  value?: number | boolean | string | null;
  state?: { temperatureC?: number; humidityPercent?: number; brightness?: number; on?: boolean };
};

export function HistoryChart({ points, unit = "" }: { points: HistoryPoint[]; unit?: string }) {
  const values = points
    .map((point) => reading(point))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length < 2) {
    return (
      <ul className="space-y-2 text-[15px]">
        {points.length === 0 ? <li className="text-muted">Истории пока нет.</li> : null}
        {points.map((point) => (
          <li key={`${point.capability ?? ""}-${point.at}`} className="flex justify-between gap-3">
            <span className="text-muted">{when(point.at)}</span>
            <span>{label(point, unit)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - ((value - min) / span) * 32;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 40" className="h-20 w-full text-accent" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <ul className="space-y-2 text-[15px]">
        {points.slice(-8).map((point) => (
          <li key={`${point.capability ?? ""}-${point.at}`} className="flex justify-between gap-3">
            <span className="text-muted">{when(point.at)}</span>
            <span>{label(point, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function reading(point: HistoryPoint): number | boolean | string | null {
  if (point.value !== undefined && point.value !== null) return point.value;
  if (typeof point.state?.temperatureC === "number") return point.state.temperatureC;
  if (typeof point.state?.humidityPercent === "number") return point.state.humidityPercent;
  if (typeof point.state?.brightness === "number") return point.state.brightness;
  if (point.state?.on === undefined) return null;
  return point.state.on ? 1 : 0;
}

function label(point: HistoryPoint, unit: string): string {
  const value = point.value ?? point.state?.temperatureC ?? point.state?.humidityPercent ?? point.state?.brightness ?? (point.state?.on === undefined ? null : point.state.on);
  if (value === true) return "Вкл";
  if (value === false) return "Выкл";
  return formatChannelValue(value, unit || point.unit || (typeof point.state?.temperatureC === "number" ? "°C" : ""));
}

function when(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
