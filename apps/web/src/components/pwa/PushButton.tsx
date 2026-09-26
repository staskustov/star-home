"use client";

import { useState } from "react";
import { unconfirmed } from "@/lib/command";

function keyBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function PushButton() {
  const [notice, setNotice] = useState<string | null>(null);

  async function enable() {
    setNotice(null);
    try {
      const key = (await fetch("/api/push").then((response) => response.json())) as { publicKey?: string };
      if (!key.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setNotice(unconfirmed);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(key.publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          device: `${/Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? "телефон" : "устройство"} · ${navigator.platform || "web"}`.slice(0, 80),
        }),
      });
      setNotice(response.ok ? "Телефон сможет получать важные события." : unconfirmed);
    } catch {
      setNotice(unconfirmed);
    }
  }

  return (
    <div className="mt-8">
      <button type="button" onClick={enable} className="btn btn-secondary">
        Уведомления на телефон
      </button>
      {notice ? <p className="mt-3 text-sm text-muted">{notice}</p> : null}
    </div>
  );
}
