"use client";

import { useEffect, useMemo, useState } from "react";
import { HistoryChart, type HistoryPoint } from "@/components/home/HistoryChart";
import { displayNameForCapability, unitForCapability } from "@/server/device-channels";
import { isCapability } from "@/server/device-capabilities";

type ChannelHint = { capability: string; displayName: string; unit: string };

export function HistoryPanel({ deviceId, channels }: { deviceId: string; channels?: ChannelHint[] }) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/smart-home/history?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ points?: HistoryPoint[] }>)
      .then((body) => {
        if (!cancelled) setPoints(body.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const series = useMemo(() => groupHistory(points ?? [], channels ?? []), [points, channels]);

  if (points === null) return <p className="text-[15px] text-muted">Загрузка истории…</p>;
  if (!series.length) return <HistoryChart points={[]} />;

  return (
    <div className="grid gap-6">
      {series.map((item) => (
        <div key={item.capability}>
          {series.length > 1 ? <p className="mb-3 text-[15px] text-ink">{item.title}</p> : null}
          <HistoryChart points={item.points} unit={item.unit} />
        </div>
      ))}
    </div>
  );
}

function groupHistory(points: HistoryPoint[], channels: ChannelHint[]) {
  const byCap = new Map<string, HistoryPoint[]>();
  for (const point of points) {
    const caps = point.capability
      ? [point.capability]
      : [
          ...(typeof point.state?.temperatureC === "number" ? ["temperature"] : []),
          ...(typeof point.state?.humidityPercent === "number" ? ["humidity"] : []),
          ...(typeof point.state?.brightness === "number" ? ["brightness"] : []),
          ...(point.state?.on !== undefined ? ["power"] : []),
        ];
    if (!caps.length) caps.push("value");
    for (const capability of caps) {
      const hint = channels.find((channel) => channel.capability === capability);
      const value =
        capability === "temperature"
          ? (point.state?.temperatureC ?? point.value)
          : capability === "humidity"
            ? (point.state?.humidityPercent ?? point.value)
            : capability === "brightness"
              ? (point.state?.brightness ?? point.value)
              : capability === "power"
                ? (point.state?.on ?? point.value)
                : point.value;
      const list = byCap.get(capability) ?? [];
      list.push({
        ...point,
        capability,
        value: value ?? null,
        unit: hint?.unit ?? (isCapability(capability) ? unitForCapability(capability) : ""),
      });
      byCap.set(capability, list);
    }
  }
  return [...byCap.entries()].map(([capability, rows]) => {
    const hint = channels.find((channel) => channel.capability === capability);
    return {
      capability,
      title: hint?.displayName ?? (isCapability(capability) ? displayNameForCapability(capability) : "Значение"),
      unit: hint?.unit ?? (isCapability(capability) ? unitForCapability(capability) : ""),
      points: rows,
    };
  });
}
