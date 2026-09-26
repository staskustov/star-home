"use client";

import { useEffect, useState } from "react";
import { NotificationBell, type NoticeRow } from "@/components/shell/NotificationBell";
import { ProfileAvatar } from "@/components/shell/ProfileAvatar";

type Me = { name: string; photo: string | null; notices: NoticeRow[] };

const empty: Me = { name: "", photo: null, notices: [] };

export function AccountActions() {
  const [me, setMe] = useState<Me>(empty);

  useEffect(() => {
    const load = () => {
      fetch("/api/notifications", { cache: "no-store" })
        .then((response) => response.json() as Promise<Partial<Me>>)
        .then((body) => {
          setMe({
            name: typeof body.name === "string" ? body.name : "",
            photo: typeof body.photo === "string" ? body.photo : null,
            notices: Array.isArray(body.notices) ? body.notices : [],
          });
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("star-profile", load);
    return () => window.removeEventListener("star-profile", load);
  }, []);

  return (
    <>
      <NotificationBell notices={me.notices} />
      <ProfileAvatar name={me.name} photo={me.photo} />
    </>
  );
}
