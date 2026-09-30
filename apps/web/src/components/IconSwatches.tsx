"use client";

import { deviceIconColorOf, deviceIconSwatches } from "@/lib/google-icons";

export function IconSwatches({
  color,
  onChange,
  disabled = false,
}: {
  color?: string | null;
  onChange: (hex: string | null) => void;
  disabled?: boolean;
}) {
  const hex = deviceIconColorOf(color);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        title="Цвет темы"
        aria-label="Цвет темы"
        aria-pressed={!hex}
        disabled={disabled}
        className={`h-8 w-8 rounded-full border ${hex ? "border-line" : "border-ink ring-2 ring-accent/40"}`}
        style={{ background: "var(--accent)" }}
        onClick={() => onChange(null)}
      />
      {deviceIconSwatches.map((swatch) => (
        <button
          key={swatch.hex}
          type="button"
          title={swatch.label}
          aria-label={swatch.label}
          aria-pressed={hex === swatch.hex}
          disabled={disabled}
          className={`h-8 w-8 rounded-full ${hex === swatch.hex ? "ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface)]" : "border border-line"}`}
          style={{ background: swatch.hex }}
          onClick={() => onChange(swatch.hex)}
        />
      ))}
    </div>
  );
}
