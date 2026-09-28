"use client";

import { useEffect } from "react";
import { standaloneDisplay, subscribePush } from "@/lib/push-client";

export function PushAuto() {
  useEffect(() => {
    const run = () => {
      const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
      const ask = standaloneDisplay() || granted;
      void subscribePush(ask).catch(() => undefined);
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
    };
  }, []);
  return null;
}
