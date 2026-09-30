"use client";

import { useMemo, useState } from "react";
import { DeviceTileIcon, GoogleIcon } from "@/components/GoogleIcon";
import {
  deviceIconColorLabel,
  deviceIconColorOf,
  deviceIconOf,
  deviceIconSwatches,
  materialSymbolNames,
  searchMaterialSymbols,
} from "@/lib/google-icons";

export function IconPicker({
  value,
  color,
  kind,
  onChange,
  onColorChange,
  disabled = false,
}: {
  value?: string | null;
  color?: string | null;
  kind?: string;
  onChange: (name: string) => void;
  onColorChange?: (hex: string | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = deviceIconOf(value, kind);
  const hex = deviceIconColorOf(color);
  const icons = useMemo(() => searchMaterialSymbols(query, kind, 280), [query, kind]);

  return (
    <div>
      <span className="text-sm text-muted">Иконка</span>
      <button
        type="button"
        className="control mt-2 flex w-full items-center gap-3 text-left"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <DeviceTileIcon name={selected} kind={kind} color={hex} size={20} />
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
          {selected.replaceAll("_", " ")} · {deviceIconColorLabel(hex)}
        </span>
        <span className="text-[13px] text-muted">{open ? "Скрыть" : "Выбрать"}</span>
      </button>
      {onColorChange ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            title="Цвет темы"
            aria-label="Цвет темы"
            disabled={disabled}
            className={`h-8 w-8 rounded-full border ${hex ? "border-line" : "border-ink ring-2 ring-accent/40"}`}
            style={{ background: "var(--accent)" }}
            onClick={() => onColorChange(null)}
          />
          {deviceIconSwatches.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              title={swatch.label}
              aria-label={swatch.label}
              disabled={disabled}
              className={`h-8 w-8 rounded-full ${hex === swatch.hex ? "ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface)]" : "border border-line"}`}
              style={{ background: swatch.hex }}
              onClick={() => onColorChange(swatch.hex)}
            />
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="mt-3 rounded-2xl border border-line p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="control"
            placeholder="Поиск по названию"
            autoFocus
          />
          <div className="mt-3 grid max-h-64 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-10">
            {icons.map((name) => (
              <button
                key={name}
                type="button"
                title={name.replaceAll("_", " ")}
                className={`grid aspect-square place-items-center rounded-xl ${name === selected ? "bg-accent/15 text-accent" : "text-ink hover:bg-line/60"}`}
                style={name === selected && hex ? { color: hex, background: `color-mix(in srgb, ${hex} 18%, transparent)` } : hex ? { color: hex } : undefined}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
              >
                <GoogleIcon name={name} size={22} />
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">
            {query.trim() ? `Найдено ${icons.length}` : `Google Icons · ${materialSymbolNames.length}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
