"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function StatusToast({ text, stamp = 0 }: { text: string | null; stamp?: number }) {
  const [visible, setVisible] = useState(text);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setVisible(text);
    if (!text) return;
    const timer = window.setTimeout(() => setVisible(null), 3000);
    return () => window.clearTimeout(timer);
  }, [text, stamp]);

  if (!mounted || !visible) return null;

  return createPortal(
    <div className="status-toast" role="dialog" aria-live="polite" aria-label={visible}>
      <p className="status-toast-card">{visible}</p>
    </div>,
    document.body,
  );
}
