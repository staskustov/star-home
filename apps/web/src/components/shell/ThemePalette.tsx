"use client";

import { applyAppearance, themeChoices, type PaletteId, type ThemeMode } from "@/lib/appearance";

export function ThemePalette() {
  return (
    <section className="mt-8">
      <h2 className="text-[22px] tracking-[-0.03em] text-ink">Тема</h2>
      <p className="mt-2 text-[15px] text-muted">Светлые и тёмные палитры. Выбор сохраняется на этом устройстве.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {themeChoices.map((choice) => (
          <button
            key={`${choice.mode}:${choice.id}`}
            type="button"
            data-pick={`${choice.mode}:${choice.id}`}
            className="panel px-3 py-3 text-left"
            onClick={() => applyAppearance(choice.mode as ThemeMode, choice.id as PaletteId)}
          >
            <span className="flex h-10 overflow-hidden rounded-xl border border-line" aria-hidden>
              <span className="w-1/2" style={{ background: choice.bg }} />
              <span className="w-1/4" style={{ background: choice.surface }} />
              <span className="w-1/4" style={{ background: choice.accent }} />
            </span>
            <span className="mt-3 block text-[14px] text-ink">{choice.label}</span>
            <span className="mt-0.5 block text-[12px] text-muted">{choice.tone}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
