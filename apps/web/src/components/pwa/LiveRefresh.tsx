"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const pollMs = 20_000;

type Live = { token?: string; socket?: string | null };

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let token = "";
    let pulse = "";

    const live = () => fetch("/api/live").then((response) => response.json() as Promise<Live>);

    const check = async () => {
      if (closed || document.visibilityState !== "visible") return;
      const response = await fetch(`/api/live/pulse?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (response.status === 401) {
        token = (await live()).token ?? "";
        return;
      }
      const next = ((await response.json()) as { pulse?: string }).pulse ?? "";
      if (pulse && next && next !== pulse) router.refresh();
      pulse = next || pulse;
    };

    const poll = () => {
      if (closed) return;
      timer = setTimeout(() => {
        check()
          .catch(() => undefined)
          .finally(poll);
      }, pollMs);
    };

    const visible = () => {
      if (document.visibilityState === "visible" && token) void check().catch(() => undefined);
    };

    live()
      .then((payload) => {
        if (closed || !payload.token) return;
        if (payload.socket) {
          socket = new WebSocket(`${payload.socket}?token=${encodeURIComponent(payload.token)}`);
          socket.onmessage = () => router.refresh();
          return;
        }
        token = payload.token;
        document.addEventListener("visibilitychange", visible);
        void check()
          .catch(() => undefined)
          .finally(poll);
      })
      .catch(() => undefined);

    return () => {
      closed = true;
      socket?.close();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router]);

  return null;
}
