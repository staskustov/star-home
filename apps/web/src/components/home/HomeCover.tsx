"use client";

import { useEffect, useState } from "react";
import { WeatherStrip, type OutdoorWeather } from "@/components/home/WeatherStrip";

export function HomeCover({
  photo,
  place,
  greeting,
  weather,
  indoor,
  compact = false,
  sky = false,
}: {
  photo?: string;
  place: string;
  greeting: string;
  weather?: OutdoorWeather | null;
  indoor?: { temperatureC: number; humidityPercent: number } | null;
  compact?: boolean;
  sky?: boolean;
}) {
  const [current, setCurrent] = useState(photo ?? "");

  useEffect(() => {
    setCurrent(photo ?? "");
  }, [photo]);
  const [first, ...rest] = greeting.split(", ");
  const name = rest.join(", ");

  return (
    <section className={`home-cover photo-card ${compact ? "home-cover-preview" : ""} ${sky ? "home-cover-sky" : ""}`}>
      {sky ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/sky-day.jpg" alt="" className="home-cover-sky-day" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/sky-night.jpg" alt="" className="home-cover-sky-night" />
        </>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={current} alt="" />
      )}
      <div className="home-cover-inner">
        <p className="on-photo-muted text-[13px] tracking-[-0.01em]">{place}</p>
        <h1 suppressHydrationWarning className="on-photo mt-1 text-[17px] leading-[1.2] tracking-[-0.03em]">
          {name ? (
            <>
              {first}, {name}
            </>
          ) : (
            first
          )}
        </h1>
        {!compact ? <WeatherStrip weather={weather} indoor={indoor} ticker onPhoto /> : null}
      </div>
    </section>
  );
}
