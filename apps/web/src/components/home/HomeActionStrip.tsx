import { Icon, type IconName } from "@/components/icons";
import { homeChipIcons } from "@/lib/home-chips";
import type { HomeChipTile } from "@/components/home/HomeChipStrip";

export type ActionChipTile = HomeChipTile & {
  deviceId?: string | null;
  latch?: "OPEN" | "CLOSED";
  stale?: boolean;
};

function chipIcon(name: string): IconName {
  return (homeChipIcons as readonly string[]).includes(name) ? (name as IconName) : "settings";
}

export function HomeActionStrip({
  chips,
  onSelect,
}: {
  chips: ActionChipTile[];
  onSelect: (chip: ActionChipTile) => void;
}) {
  if (!chips.length) return null;
  return (
    <div role="list" aria-label="Быстрые кнопки" className="action-row">
      {chips.map((chip) => {
        const status = chip.stale ? "Нет связи" : chip.latch === "OPEN" ? "Открыто" : chip.latch === "CLOSED" ? "Закрыто" : null;
        return (
          <button key={chip.id} type="button" role="listitem" onClick={() => onSelect(chip)} className="tile action-tile">
            <span className="tile-icon">
              <Icon name={chipIcon(chip.icon)} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block truncate leading-[1.2]">{chip.name}</span>
              {status ? <span className="mt-0.5 block text-[13px] text-muted">{status}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
