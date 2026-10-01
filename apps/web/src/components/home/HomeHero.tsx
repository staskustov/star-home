"use client";

import { useState } from "react";
import { FloorPlan } from "@/components/home/FloorPlan";
import { MetricChip, metricLook, type MetricStyle } from "@/components/home/MetricChip";
import type { HomeCamera } from "@/components/home/CameraViewer";
import type { PlanPin } from "@/lib/plan-pin";
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

type Plan = { floor: number; image: string; pins: PlanPin[] };

export function HomeHero({
  unitName,
  rooms,
  plans = [],
  temperatureC,
  humidityPercent,
  metrics,
  canCommand = false,
  cameras = [],
}: {
  unitName: string;
  rooms: { id?: string; name: string; deviceCount?: number; temperatureC?: number | null; humidityPercent?: number | null }[];
  plans?: Plan[];
  temperatureC: number | null;
  humidityPercent: number | null;
  metrics?: MetricStyle[];
  canCommand?: boolean;
  cameras?: HomeCamera[];
}) {
  const [index, setIndex] = useState(0);
  const deviceCount = rooms.reduce((sum, room) => sum + (room.deviceCount ?? 0), 0);
  const slides = rooms.map((room) => ({
    name: room.name,
    href: room.id ? `/rooms/${room.id}` : "/rooms",
    deviceCount: room.deviceCount ?? 0,
    temperatureC: room.temperatureC ?? null,
    humidityPercent: room.humidityPercent ?? null,
  }));
  const temp = metricLook(metrics, "temperature");
  const humidity = metricLook(metrics, "humidity");

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    setIndex(Math.round(target.scrollLeft / (width + 12)));
  }

  return (
    <section aria-label="Помещения" className="w-full space-y-3">
      <div className="panel overflow-hidden px-4 py-3">
        <Link href="/rooms" className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] leading-tight tracking-[-0.03em] text-ink">Объект · {unitName}</h2>
            <p className="mt-1 text-[13px] text-muted">{devicesLabel(deviceCount)}</p>
          </div>
          <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
        </Link>
        {temperatureC !== null || humidityPercent !== null ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            {temperatureC !== null ? (
              <MetricChip compact icon={temp.icon} color={temp.color} label={temp.label} value={formatTemperature(temperatureC)} />
            ) : null}
            {humidityPercent !== null ? (
              <MetricChip compact icon={humidity.icon} color={humidity.color} label={humidity.label} value={formatHumidity(humidityPercent)} />
            ) : null}
          </p>
        ) : null}
      </div>

      {plans.length ? <FloorPlan floors={plans} canCommand={canCommand} cameras={cameras} switcher /> : null}

      {slides.length ? (
        <>
          <div className="film" onScroll={onScroll}>
            {slides.map((slide) => (
              <Link
                key={slide.href + slide.name}
                href={slide.href}
                className="panel w-[78%] shrink-0 snap-center overflow-hidden px-4 py-3 sm:w-[min(100%,20rem)]"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[18px] leading-tight tracking-[-0.03em] text-ink">{slide.name}</span>
                    <span className="mt-1 block text-[13px] text-muted">{devicesLabel(slide.deviceCount)}</span>
                    {slide.temperatureC !== null || slide.humidityPercent !== null ? (
                      <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
                        {slide.temperatureC !== null ? (
                          <MetricChip compact icon={temp.icon} color={temp.color} label={temp.label} value={formatTemperature(slide.temperatureC)} />
                        ) : null}
                        {slide.humidityPercent !== null ? (
                          <MetricChip compact icon={humidity.icon} color={humidity.color} label={humidity.label} value={formatHumidity(slide.humidityPercent)} />
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
                </span>
              </Link>
            ))}
          </div>
          {slides.length > 1 ? (
            <div className="flex justify-center gap-1.5" aria-hidden>
              {slides.map((slide, position) => (
                <span
                  key={`${slide.name}-${position}`}
                  className={`h-1.5 rounded-full transition-all duration-200 ${position === index ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
