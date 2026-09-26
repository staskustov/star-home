"use client";

import { useEffect, useState } from "react";
import { commandInFlight, watchCommands } from "@/lib/command";
import { PushAuto } from "@/components/pwa/PushAuto";

const updatedKey = "star-home-updated";

function applyWaiting(registration: ServiceWorkerRegistration): void {
  if (commandInFlight()) return;
  if (registration.waiting && navigator.serviceWorker.controller) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
}

export function ServiceWorkerRegister() {
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(updatedKey)) {
      sessionStorage.removeItem(updatedKey);
      setUpdated(true);
      const timer = window.setTimeout(() => setUpdated(false), 6000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let timer = 0;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const watch = () => {
          if (active) applyWaiting(registration);
        };
        watch();
        void registration.update();
        timer = window.setInterval(() => void registration.update(), 30 * 60_000);
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", watch);
        });
        let seenController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!seenController) {
            seenController = true;
            return;
          }
          sessionStorage.setItem(updatedKey, "1");
          window.location.reload();
        });
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "APP_UPDATED") {
            sessionStorage.setItem(updatedKey, "1");
          }
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => watchCommands(() => setBusy(commandInFlight())), []);

  return (
    <>
      <PushAuto />
      {updated && !busy ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <p role="status" className="panel px-4 py-3 text-[14px] text-ink">
            Приложение обновлено
          </p>
        </div>
      ) : null}
    </>
  );
}
