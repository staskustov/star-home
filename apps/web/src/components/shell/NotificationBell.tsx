"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

export type NoticeRow = { id: string; title: string; body: string; at: string; severity?: string };

export function NotificationBell({ notices }: { notices: NoticeRow[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="relative btn btn-secondary btn-icon"
        aria-label={notices.length ? `Уведомления, ${notices.length}` : "Уведомления"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" />
        {notices.length ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-line bg-bg shadow-[0_16px_40px_rgba(26,26,26,0.12)]">
          <p className="px-4 py-3 text-[13px] text-muted">Уведомления</p>
          {notices.length === 0 ? (
            <p className="px-4 pb-4 text-[15px] text-muted">Пока тихо.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id} className="px-4 py-3">
                  <p className={`text-[15px] ${notice.severity === "ALERT" ? "text-danger" : "text-ink"}`}>{notice.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {notice.body} · {notice.at}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
