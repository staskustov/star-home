"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    fetch("/api/live")
      .then((response) => response.json())
      .then((payload: { token?: string }) => {
        if (closed || !payload.token) return;
        const base = process.env.NEXT_PUBLIC_STAR_HOME_LIVE ?? "ws://127.0.0.1:3457/live";
        socket = new WebSocket(`${base}?token=${encodeURIComponent(payload.token)}`);
        socket.onmessage = () => router.refresh();
      })
      .catch(() => undefined);
    return () => {
      closed = true;
      socket?.close();
    };
  }, [router]);

  return null;
}
