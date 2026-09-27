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
  if (!chips.length) return null;
  return (
    <div role="list" aria-label={label} className="chip-row">
      {chips.map((chip) => {
        const selected = Boolean(chip.lifeMode && chip.lifeMode === activeMode);
        return (
          <button
            key={chip.id}
            type="button"
            role="listitem"
            aria-pressed={selected}
            aria-checked={selected}
            onClick={() => onSelect(chip)}
            className="segment-item"
          >
            <Icon name={chipIcon(chip.icon)} className="h-6 w-6" />
            {chip.name}
          </button>
        );
      })}
    </div>
  );
}
