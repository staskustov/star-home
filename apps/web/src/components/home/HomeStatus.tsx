import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatHumidity, formatTemperature } from "@/lib/format";
import type { Tone } from "@/types/domain";

export function HomeStatus({
  unitName,
  summary,
  tone,
  detail,
  temperatureC,
  humidityPercent,
}: {
  unitName: string;
  summary: string;
  tone: Tone;
  detail: string;
  temperatureC: number | null;
  humidityPercent: number | null;
}) {
  return (
    <section className="panel px-5 py-5">
      <h2 className="text-[22px] tracking-[-0.03em] text-ink">{unitName}</h2>
      <div key={summary} className="fade-in mt-3">
        <StatusBadge tone={tone}>{summary}</StatusBadge>
        <p className="mt-2 text-sm text-muted">{detail}</p>
      </div>
      {temperatureC !== null && humidityPercent !== null ? (
        <dl className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted">Температура</dt>
            <dd className="mt-2 text-[40px] leading-none font-medium tracking-[-0.05em] text-ink">{formatTemperature(temperatureC)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Влажность</dt>
            <dd className="mt-2 text-[40px] leading-none font-medium tracking-[-0.05em] text-ink">{formatHumidity(humidityPercent)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
