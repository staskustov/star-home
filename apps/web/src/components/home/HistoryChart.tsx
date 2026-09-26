type Point = { at: string; state?: { temperatureC?: number; humidityPercent?: number; brightness?: number; on?: boolean } };

export function HistoryChart({ points }: { points: Point[] }) {
  const values = points
    .map((point) => point.state?.temperatureC ?? point.state?.brightness ?? (point.state?.on === undefined ? null : point.state.on ? 1 : 0))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length < 2) {
    return (
      <ul className="space-y-2 text-[15px]">
        {points.length === 0 ? <li className="text-muted">Истории пока нет.</li> : null}
        {points.map((point) => (
          <li key={point.at} className="flex justify-between gap-3">
            <span className="text-muted">{point.at}</span>
            <span>{label(point)}</span>
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
          <li key={point.at} className="flex justify-between gap-3">
            <span className="text-muted">{point.at}</span>
            <span>{label(point)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function label(point: Point): string {
  if (typeof point.state?.temperatureC === "number") return `${String(point.state.temperatureC).replace(".", ",")}°`;
  if (typeof point.state?.brightness === "number") return `${point.state.brightness}%`;
  if (point.state?.on === true) return "Вкл";
  if (point.state?.on === false) return "Выкл";
  return "—";
}
