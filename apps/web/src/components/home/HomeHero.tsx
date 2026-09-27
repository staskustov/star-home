"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { formatHumidity, formatTemperature } from "@/lib/format";

function devicesLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} устройство`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} устройства`;
  return `${count} устройств`;
}

export function HomeHero({
  unitName,
  rooms,
  temperatureC,
  humidityPercent,
}: {
  unitName: string;
  rooms: { id?: string; name: string; deviceCount?: number }[];
  temperatureC: number | null;
  humidityPercent: number | null;
}) {
  const [index, setIndex] = useState(0);
  const slides = [{ name: unitName, deviceCount: rooms.reduce((sum, room) => sum + (room.deviceCount ?? 0), 0), house: true }, ...rooms.map((room) => ({ name: room.name, deviceCount: room.deviceCount ?? 0, house: false }))];

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    setIndex(Math.round(target.scrollLeft / (width + 12)));
  }

  return (
    <section aria-label="Помещения">
      <div className="film" onScroll={onScroll}>
        {slides.map((slide, position) => (
          <article key={`${slide.name}-${position}`} className="panel w-full shrink-0 snap-center px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[18px] leading-tight tracking-[-0.03em] text-ink">{slide.name}</h2>
                <p className="mt-1 text-[13px] text-muted">{devicesLabel(slide.deviceCount)}</p>
              </div>
              {slides.length > 1 ? (
                <p className="shrink-0 text-[12px] text-muted">
                  {position + 1} / {slides.length}
                </p>
              ) : null}
            </div>
            {slide.house && (temperatureC !== null || humidityPercent !== null) ? (
              <p className="mt-2 flex items-center gap-3 text-[13px] text-muted">
                {temperatureC !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="thermo" className="h-3.5 w-3.5" />
                    {formatTemperature(temperatureC)}
                  </span>
                ) : null}
                {humidityPercent !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="drop" className="h-3.5 w-3.5" />
                    {formatHumidity(humidityPercent)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {slides.map((slide, position) => (
            <span
              key={`${slide.name}-${position}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${position === index ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
