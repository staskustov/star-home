"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { formatHumidity, formatTemperature } from "@/lib/format";
import type { Tone } from "@/types/domain";

const toneText: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function HomeHero({
  unitName,
  rooms,
  summary,
  detail,
  tone,
  security,
  temperatureC,
  humidityPercent,
}: {
  unitName: string;
  rooms: { name: string }[];
  summary: string;
  detail: string;
  tone: Tone;
  security: string;
  temperatureC: number | null;
  humidityPercent: number | null;
}) {
  const [index, setIndex] = useState(0);
  const slides = [unitName, ...rooms.map((room) => room.name)];

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    setIndex(Math.round(target.scrollLeft / (width + 12)));
  }

  return (
    <section aria-label="Помещения">
      <div className="film" onScroll={onScroll}>
        {slides.map((name, position) => (
          <article key={name} className="panel w-full shrink-0 snap-center px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-[24px] leading-tight tracking-[-0.035em] text-ink">{name}</h2>
                <p className={`mt-2 flex items-center gap-2 text-[15px] ${tone === "danger" ? "text-danger" : "text-ink"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden />
                  {summary}
                </p>
                <p className="mt-1 text-sm text-muted">{detail}</p>
              </div>
              {slides.length > 1 ? (
                <p className="shrink-0 text-[13px] text-muted">
                  {position + 1} / {slides.length}
                </p>
              ) : null}
            </div>
            <dl className="mt-5 grid grid-cols-3 divide-x divide-line/60 border-t border-line/60 pt-4">
              <Metric icon="thermo" label="Температура" value={temperatureC !== null ? formatTemperature(temperatureC) : "—"} />
              <Metric icon="drop" label="Влажность" value={humidityPercent !== null ? formatHumidity(humidityPercent) : "—"} className="pl-3" />
              <div className="flex min-w-0 flex-col pl-3">
                <dt className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <Icon name="security" className={`h-4 w-4 ${toneText[tone]}`} />
                  Защита
                </dt>
                <dd className={`mt-2 text-[15px] leading-tight ${toneText[tone]}`}>{security}</dd>
              </div>
            </dl>
            {position > 0 ? <p className="mt-3 text-[12px] text-muted">Показания климата дома</p> : null}
          </article>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {slides.map((name, position) => (
            <span
              key={name}
              className={`h-1.5 rounded-full transition-all duration-200 ${position === index ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ icon, label, value, className = "" }: { icon: IconName; label: string; value: string; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col pr-3 ${className}`}>
      <dt className="flex flex-col gap-1.5 text-[13px] text-muted">
        <Icon name={icon} className="h-4 w-4" />
        {label}
      </dt>
      <dd className="mt-1.5 text-[26px] leading-none font-medium tracking-[-0.04em] text-ink">{value}</dd>
    </div>
  );
}
