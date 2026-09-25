"use client";

import { useEffect, useState } from "react";

export type ViewMode = "list" | "blocks";

export function useViewMode(key: string): [ViewMode, (mode: ViewMode) => void] {
  const storageKey = `star-home-view:${key}`;
  const [mode, setMode] = useState<ViewMode>("list");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "list" || stored === "blocks") setMode(stored);
  }, [storageKey]);

  function change(next: ViewMode) {
    setMode(next);
    window.localStorage.setItem(storageKey, next);
  }

  return [mode, change];
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="Вид">
      <button
        type="button"
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
        className={`rounded-full px-3 py-1 text-sm ${value === "list" ? "bg-accent text-accent-contrast" : "text-muted"}`}
      >
        Список
      </button>
      <button
        type="button"
        aria-pressed={value === "blocks"}
        onClick={() => onChange("blocks")}
        className={`rounded-full px-3 py-1 text-sm ${value === "blocks" ? "bg-accent text-accent-contrast" : "text-muted"}`}
      >
        Блоки
      </button>
    </div>
  );
}
