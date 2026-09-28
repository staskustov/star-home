"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { MetricChip, metricLook, type MetricStyle } from "@/components/home/MetricChip";
import { PhotoCrop } from "@/components/shell/PhotoCrop";
import { commandMessage, runCommand } from "@/lib/command";
import { formatHumidity, formatTemperature } from "@/lib/format";

export function HomeCover({
  photo,
  place,
  greeting,
  temperatureC,
  humidityPercent,
  metrics,
  canEdit,
  compact = false,
  scope = "unit",
  objectId,
}: {
  photo: string;
  place: string;
  greeting: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  metrics?: MetricStyle[];
  canEdit: boolean;
  compact?: boolean;
  scope?: "unit" | "object";
  objectId?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState(photo);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(photo);
  }, [photo]);
  const temp = metricLook(metrics, "temperature");
  const humidity = metricLook(metrics, "humidity");
  const [first, ...rest] = greeting.split(", ");
  const name = rest.join(", ");

  async function save(next: string | null) {
    setFile(null);
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/home-cover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo: next, scope, objectId }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return;
    }
    const body = result.payload as { photo?: string | null };
    setCurrent(typeof body.photo === "string" && body.photo ? body.photo : "/images/house-dusk.jpg");
  }

  return (
    <section className={`home-cover photo-card ${compact ? "home-cover-preview" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt="" />
      <div className="home-cover-inner">
        <p className="on-photo-muted text-[13px] tracking-[-0.01em]">{place}</p>
        <h1 suppressHydrationWarning className="on-photo mt-2 text-[34px] leading-[1.05] tracking-[-0.04em]">
          {name ? (
            <>
              {first},
              <br />
              {name}
            </>
          ) : (
            first
          )}
        </h1>
        {temperatureC !== null || humidityPercent !== null ? (
          <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
            {temperatureC !== null ? (
              <MetricChip onPhoto compact icon={temp.icon} color={temp.color} label={temp.label} value={formatTemperature(temperatureC)} />
            ) : null}
            {humidityPercent !== null ? (
              <MetricChip onPhoto compact icon={humidity.icon} color={humidity.color} label={humidity.label} value={formatHumidity(humidityPercent)} />
            ) : null}
          </p>
        ) : null}
        {canEdit ? (
          <button type="button" className="home-cover-edit" aria-label="Сменить фото дома" onClick={() => picker.current?.click()}>
            <Icon name="camera" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {canEdit ? (
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const next = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            setFile(next);
          }}
        />
      ) : null}
      {notice ? <p className="on-photo-muted px-5 pb-3 text-[13px]">{notice}</p> : null}
      {file ? (
        <PhotoCrop file={file} round={false} ratio={3 / 4} outputWidth={720} onCancel={() => setFile(null)} onDone={(photo) => void save(photo)} />
      ) : null}
    </section>
  );
}
