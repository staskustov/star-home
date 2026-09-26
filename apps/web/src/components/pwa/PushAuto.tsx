"use client";

import { useEffect } from "react";

function keyBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function deviceLabel(): string {
  const mobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  return `${mobile ? "телефон" : "устройство"} · ${navigator.platform || "web"}`.slice(0, 80);
}

async function subscribeThisDevice(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  const key = (await fetch("/api/push").then((response) => response.json())) as { publicKey?: string };
  if (!key.publicKey) return;
  if (Notification.permission === "default" && standalone()) {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key.publicKey) as BufferSource,
  });
  const json = subscription.toJSON();
  if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device: deviceLabel(),
    }),
  });
}

export function PushAuto() {
  useEffect(() => {
    void subscribeThisDevice().catch(() => undefined);
  }, []);
  return null;
}
