"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

const kindLabel: Record<HomeChipTile["kind"], string> = {
  LIFE_MODE: "Режим",
  SCENARIO: "Сценарий",
  ACTION: "Действие",
};

function chipIcon(name: string): IconName {
  return (homeChipIcons as readonly string[]).includes(name) ? (name as IconName) : "settings";
}

export function HomeChipStrip({
  chips,
  label,
  activeMode,
  createHref,
  onSelect,
}: {
  chips: HomeChipTile[];
  label: string;
  activeMode?: LifeMode;
  createHref?: string;
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

  return (
    <div role="list" aria-label={label} className="scene-row">
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
            className="scene-tile"
          >
            <Icon name={chipIcon(chip.icon)} className="scene-tile-icon" />
            <span className="scene-tile-name">{chip.name}</span>
            <span className="scene-tile-sub">{selected ? "Активный" : kindLabel[chip.kind]}</span>
          </button>
        );
      })}
      {createHref ? (
        <Link href={createHref} role="listitem" className="scene-tile scene-tile-add" aria-label="Создать сценарий">
          <Icon name="plus" className="scene-tile-icon" />
          <span className="scene-tile-name">Создать</span>
        </Link>
      ) : null}
    </div>
  );
}
