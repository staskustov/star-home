"use client";

import { useEffect, useState } from "react";
import { commandInFlight, watchCommands } from "@/lib/command";

export function ServiceWorkerRegister() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const watch = () => {
        const waiting = Boolean(registration.waiting) && Boolean(navigator.serviceWorker.controller);
        if (active) setReady(waiting);
      };
      watch();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", watch);
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => watchCommands(() => setBusy(commandInFlight())), []);

  function update() {
    if (commandInFlight()) return;
    navigator.serviceWorker.getRegistration().then((registration) => {
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  }

  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <button type="button" onClick={update} disabled={busy} className="btn btn-primary disabled:opacity-40">
        Обновить
      </button>
    </div>
  );
}
