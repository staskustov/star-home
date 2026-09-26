"use client";

import { useEffect, useState } from "react";
import { SecuritySosOverlay } from "@/components/security/SecuritySosOverlay";
import { runCommand } from "@/lib/command";
import type { SecurityPostView } from "@/types/security";

type Alerts = Pick<SecurityPostView, "objectId" | "objectName" | "can" | "alarms">;

const pollMs = 2000;

export function SecuritySosWatch() {
  const [view, setView] = useState<Alerts | null>(null);

  useEffect(() => {
    let closed = false;
    const load = async () => {
      const response = await fetch("/api/security/alerts", { cache: "no-store" });
      if (!response.ok || closed) return;
      const payload = (await response.json().catch(() => null)) as Alerts | null;
      if (payload && Array.isArray(payload.alarms)) setView(payload);
    };
    void load();
    const timer = window.setInterval(() => void load(), pollMs);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      closed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  async function accept(id: string) {
    await runCommand(() =>
      fetch(`/api/security/alarms/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "ACCEPT" }),
      }),
    );
    const response = await fetch("/api/security/alerts", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as Alerts | { message?: string } | null;
    if (response.ok && payload && "alarms" in payload) setView(payload);
  }

  if (!view) return null;
  return <SecuritySosOverlay view={view} onAccept={(id) => void accept(id)} />;
}
