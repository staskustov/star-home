"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { homeChipIcons } from "@/lib/home-chips";
import type { LifeMode } from "@/types/domain";

export type HomeChipTile = {
  id: string;
  name: string;
  icon: string;
  kind: "LIFE_MODE" | "SCENARIO" | "ACTION";
  lifeMode?: LifeMode;
  scenarioId?: string | null;
  action?: string | null;
};

function chipIcon(name: string): IconName {
  return (homeChipIcons as readonly string[]).includes(name) ? (name as IconName) : "settings";
}

export function HomeChipStrip({
  chips,
  label,
  activeMode,
  onSelect,
}: {
  chips: HomeChipTile[];
  label: string;
  activeMode?: LifeMode;
  onSelect: (chip: HomeChipTile) => void;
}) {
  const modeChipId = chips.find((chip) => chip.lifeMode && chip.lifeMode === activeMode)?.id;
  const [pickedId, setPickedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setPickedId((current) => {
      const picked = chips.find((chip) => chip.id === current);
      if (!current || picked?.lifeMode) return modeChipId;
      return current;
    });
  }, [activeMode, chips, modeChipId]);

  if (!chips.length) return null;
  const activeId = pickedId ?? modeChipId;
  const even = chips.length === 4;

  return (
    <div role="list" aria-label={label} className={even ? "chip-row chip-row-even" : "chip-row"}>
      {chips.map((chip) => {
        const selected = chip.id === activeId;
        return (
          <button
            key={chip.id}
            type="button"
            role="listitem"
            aria-pressed={selected}
            aria-checked={selected}
            onClick={() => {
              setPickedId(chip.id);
              onSelect(chip);
            }}
            className="segment-item"
          >
            <Icon name={chipIcon(chip.icon)} className="h-5 w-5" />
            {chip.name}
          </button>
        );
      })}
    </div>
  );
}
