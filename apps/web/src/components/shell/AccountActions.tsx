"use client";

import { useEffect, useState } from "react";
import { NotificationBell, type NoticeRow } from "@/components/shell/NotificationBell";
import { ProfileAvatar } from "@/components/shell/ProfileAvatar";
import { syncAppBadge } from "@/lib/app-badge";

type Me = { name: string; photo: string | null; notices: NoticeRow[]; unread: number };

const empty: Me = { name: "", photo: null, notices: [], unread: 0 };

export function AccountActions() {
  const [me, setMe] = useState<Me>(empty);

  useEffect(() => {
    const load = () => {
      fetch("/api/notifications", { cache: "no-store" })
        .then((response) => response.json() as Promise<Partial<Me>>)
        .then((body) => {
          const notices = Array.isArray(body.notices) ? body.notices : [];
          const unread =
            typeof body.unread === "number" ? body.unread : notices.filter((notice) => !notice.readAt).length;
          setMe({
            name: typeof body.name === "string" ? body.name : "",
            photo: typeof body.photo === "string" ? body.photo : null,
            notices,
            unread,
          });
          syncAppBadge(unread);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 20_000);
    window.addEventListener("star-profile", load);
    window.addEventListener("focus", load);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "NOTICE") return;
      if (typeof event.data.badge === "number") {
        const unread = Math.max(0, event.data.badge);
        setMe((current) => ({ ...current, unread }));
        syncAppBadge(unread || 1);
      }
      load();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("star-profile", load);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <>
      <NotificationBell
        notices={me.notices}
        unread={me.unread}
        onRead={() => {
          setMe((current) => ({
            ...current,
            unread: 0,
            notices: current.notices.map((notice) => (notice.readAt ? notice : { ...notice, readAt: new Date().toISOString() })),
          }));
          syncAppBadge(0);
        }}
      />
      <ProfileAvatar name={me.name} photo={me.photo} />
    </>
  );
}
