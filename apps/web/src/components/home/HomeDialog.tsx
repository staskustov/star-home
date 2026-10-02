"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";

export function HomeDialog({
  title,
  full = false,
  onClose,
  children,
}: {
  title: string;
  full?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={`home-dialog ${full ? "home-dialog-full" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="home-dialog-panel" onClick={(event) => event.stopPropagation()}>
        <div className="home-dialog-head">
          <h2 className="home-dialog-title">{title}</h2>
          <button type="button" className="btn-icon" aria-label="Закрыть" onClick={onClose}>
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="home-dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
