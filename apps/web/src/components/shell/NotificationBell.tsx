"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";

export type NoticeRow = { id: string; title: string; body: string; at: string; severity?: string; readAt?: string | null };

export function NotificationBell({
  notices,
  unread: unreadCount,
  onRead,
}: {
  notices: NoticeRow[];
  unread?: number;
  onRead?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(notices);
  const [mounted, setMounted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRows(notices);
  }, [notices]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || sheet.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const localUnread = rows.filter((notice) => !notice.readAt).length;
  const unread = unreadCount ?? localUnread;
  const badge = unread > 99 ? "99+" : String(unread);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || unread === 0) return;
    const at = new Date().toISOString();
    setRows((current) => current.map((notice) => (notice.readAt ? notice : { ...notice, readAt: at })));
    onRead?.();
    void fetch("/api/notifications", { method: "POST" })
      .then(() => window.dispatchEvent(new Event("star-profile")))
      .catch(() => undefined);
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        className="relative btn btn-secondary btn-icon"
        aria-label={unread ? `Уведомления, непрочитанных ${unread}` : "Уведомления"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bell" />
        {unread ? (
          <span className="notice-badge" aria-hidden>
            {badge}
          </span>
        ) : null}
      </button>
      {open && mounted
        ? createPortal(
            <div ref={sheet} className="notice-popover">
              <p className="px-4 py-3 text-[13px] text-muted">Уведомления</p>
              {rows.length === 0 ? (
                <p className="px-4 pb-4 text-[15px] text-muted">Пока тихо.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {rows.map((notice) => (
                    <li key={notice.id} className="px-4 py-3">
                      <p className={`text-[15px] ${notice.severity === "ALERT" ? "text-danger" : "text-ink"}`}>{notice.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {notice.body} · {notice.at}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
