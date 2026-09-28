"use client";

import { useState } from "react";
import { MetricChip, metricLook, type MetricStyle } from "@/components/home/MetricChip";
import { Icon } from "@/components/icons";
import { formatHumidity, formatTemperature } from "@/lib/format";
import Link from "next/link";

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
  metrics,
}: {
  unitName: string;
  rooms: { id?: string; name: string; deviceCount?: number; temperatureC?: number | null; humidityPercent?: number | null }[];
  temperatureC: number | null;
  humidityPercent: number | null;
  metrics?: MetricStyle[];
}) {
  const [index, setIndex] = useState(0);
  const slides = [
    { name: unitName, href: "/rooms", deviceCount: rooms.reduce((sum, room) => sum + (room.deviceCount ?? 0), 0), temperatureC, humidityPercent },
    ...rooms.map((room) => ({
      name: room.name,
      href: room.id ? `/rooms/${room.id}` : "/rooms",
      deviceCount: room.deviceCount ?? 0,
      temperatureC: room.temperatureC ?? null,
      humidityPercent: room.humidityPercent ?? null,
    })),
  ];
  const temp = metricLook(metrics, "temperature");
  const humidity = metricLook(metrics, "humidity");

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    setIndex(Math.round(target.scrollLeft / (width + 12)));
  }

  return (
    <section aria-label="Помещения">
      <div className="film" onScroll={onScroll}>
        {slides.map((slide, position) => (
          <Link key={`${slide.name}-${position}`} href={slide.href} className="panel w-full shrink-0 snap-center px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[18px] leading-tight tracking-[-0.03em] text-ink">{slide.name}</h2>
                <p className="mt-1 text-[13px] text-muted">{devicesLabel(slide.deviceCount)}</p>
              </div>
              <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
            </div>
            {slide.temperatureC !== null || slide.humidityPercent !== null ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
                {slide.temperatureC !== null ? (
                  <MetricChip compact icon={temp.icon} color={temp.color} label={temp.label} value={formatTemperature(slide.temperatureC)} />
                ) : null}
                {slide.humidityPercent !== null ? (
                  <MetricChip compact icon={humidity.icon} color={humidity.color} label={humidity.label} value={formatHumidity(slide.humidityPercent)} />
                ) : null}
              </p>
            ) : null}
          </Link>
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
