"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Live = { token?: string; socket?: string | null };

export function LiveRefresh({ everyMs = 20_000 }: { everyMs?: number }) {
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
      }, everyMs);
    };

    const visible = () => {
      if (document.visibilityState === "visible" && token) void check().catch(() => undefined);
    };

    const connectSocket = (url: string, liveToken: string) => {
      socket?.close();
      socket = new WebSocket(`${url}?token=${encodeURIComponent(liveToken)}`);
      socket.onmessage = () => router.refresh();
      socket.onclose = () => {
        if (closed) return;
        timer = setTimeout(() => {
          live()
            .then((next) => {
              if (closed || !next.token || !next.socket) return;
              connectSocket(next.socket, next.token);
            })
            .catch(() => undefined);
        }, 3_000);
      };
    };

    live()
      .then((payload) => {
        if (closed || !payload.token) return;
        if (payload.socket) {
          connectSocket(payload.socket, payload.token);
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
  }, [everyMs, router]);

  return null;
}
