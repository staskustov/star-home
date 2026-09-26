"use client";

import { useEffect, useState } from "react";
import { HistoryChart } from "@/components/home/HistoryChart";

export function HistoryPanel({ deviceId }: { deviceId: string }) {
  const [points, setPoints] = useState<{ at: string; state?: { temperatureC?: number; humidityPercent?: number; brightness?: number; on?: boolean } }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/smart-home/history?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ points?: typeof points }>)
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

  return <HistoryChart points={points ?? []} />;
}
