type BadgeHost = {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function applyBadge(host: BadgeHost | null | undefined, count: number): void {
  if (!host) return;
  if (count > 0) {
    void host.setAppBadge?.(count);
    return;
  }
  void host.clearAppBadge?.();
}

export function syncAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const next = Math.max(0, Math.floor(count));
  applyBadge(navigator, next);
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => applyBadge(registration, next)).catch(() => undefined);
}
