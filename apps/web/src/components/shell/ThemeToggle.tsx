"use client";

import { applyAppearance, currentAppearance } from "@/lib/appearance";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle btn btn-secondary btn-icon"
      onClick={() => {
        const current = currentAppearance();
        applyAppearance(current.mode === "dark" ? "light" : "dark", current.palette);
      }}
    >
      <span className="theme-to-dark">
        <MoonIcon />
        <span className="sr-only">Тёмная тема</span>
      </span>
      <span className="theme-to-light">
        <SunIcon />
        <span className="sr-only">Светлая тема</span>
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16.5 14.5A6.5 6.5 0 0 1 9.2 5.2 6.5 6.5 0 1 0 16.5 14.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </svg>
  );
}
