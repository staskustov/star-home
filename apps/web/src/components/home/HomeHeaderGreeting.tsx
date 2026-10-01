"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function HomeHeaderGreeting({ place, greeting }: { place: string; greeting: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("resident-header-slot"));
  }, []);

  if (!slot) return null;

  return createPortal(
    <div className="min-w-0">
      <p className="truncate text-[13px] tracking-[-0.01em] text-muted">{place}</p>
      <h1 suppressHydrationWarning className="truncate text-[18px] leading-tight tracking-[-0.03em] text-ink">
        {greeting}
      </h1>
    </div>,
    slot,
  );
}
