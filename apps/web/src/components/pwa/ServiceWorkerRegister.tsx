"use client";

import { useEffect, useState } from "react";
import { commandInFlight, watchCommands } from "@/lib/command";
import { PushAuto } from "@/components/pwa/PushAuto";
import { syncThemeColor } from "@/lib/appearance";

const updatedKey = "star-home-updated";

function applyWaiting(registration: ServiceWorkerRegistration): void {
  if (commandInFlight()) return;
  if (registration.waiting && navigator.serviceWorker.controller) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
}

async function forgetDevice(): Promise<void> {
  const cleanup = (async () => {
    try {
      sessionStorage.clear();
    } catch {
      undefined;
    }
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    registration.active?.postMessage({ type: "LOGOUT" });
    const subscription = await registration.pushManager?.getSubscription().catch(() => null);
    if (subscription) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => false);
    }
  })();
  await Promise.race([cleanup, new Promise((resolve) => window.setTimeout(resolve, 1500))]);
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
    syncThemeColor();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let timer = 0;
    let stopWatching = () => undefined as void;
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
        let reloadPending = false;
        const reloadWhenIdle = () => {
          if (!reloadPending || commandInFlight()) return;
          reloadPending = false;
          sessionStorage.setItem(updatedKey, "1");
          window.location.reload();
        };
        stopWatching = watchCommands(() => {
          watch();
          reloadWhenIdle();
        });
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!seenController) {
            seenController = true;
            return;
          }
          reloadPending = true;
          reloadWhenIdle();
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
      stopWatching();
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => watchCommands(() => setBusy(commandInFlight())), []);

  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.cleaned === "1") return;
      if (new URL(form.action, window.location.href).pathname !== "/api/auth/logout") return;
      event.preventDefault();
      form.dataset.cleaned = "1";
      void forgetDevice().finally(() => form.submit());
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

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
