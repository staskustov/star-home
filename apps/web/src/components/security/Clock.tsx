"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="text-[22px] leading-none tracking-[-0.03em] text-ink tabular-nums" aria-live="off">
      {now ? now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "\u00a0"}
    </p>
  );
}
