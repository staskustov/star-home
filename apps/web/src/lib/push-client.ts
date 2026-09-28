function keyBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function standaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function iosDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function deviceLabel(): string {
  const mobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  return `${mobile ? "телефон" : "устройство"} · ${navigator.platform || "web"}`.slice(0, 80);
}

export async function subscribePush(requestIfNeeded: boolean): Promise<"ok" | "missing" | "denied" | "error"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "missing";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted" && !requestIfNeeded) return "denied";
  const key = (await fetch("/api/push", { cache: "no-store" }).then((response) => response.json())) as { publicKey?: string };
  if (!key.publicKey) return "missing";
  if (Notification.permission === "default" && requestIfNeeded) {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return "denied";
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
  ]);
  if (!registration) return "missing";
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key.publicKey) as BufferSource,
    });
  }
  const json = subscription.toJSON();
  if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) return "error";
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device: deviceLabel(),
    }),
  });
  return response.ok ? "ok" : "error";
}
