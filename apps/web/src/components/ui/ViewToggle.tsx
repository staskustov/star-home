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
    <div className="inline-flex gap-1 rounded-[16px] border border-line bg-surface p-1" role="group" aria-label="Вид">
      <button
        type="button"
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
        className={`btn btn-compact ${value === "list" ? "btn-primary" : "btn-secondary"}`}
      >
        Список
      </button>
      <button
        type="button"
        aria-pressed={value === "blocks"}
        onClick={() => onChange("blocks")}
        className={`btn btn-compact ${value === "blocks" ? "btn-primary" : "btn-secondary"}`}
      >
        Блоки
      </button>
    </div>
  );
}
