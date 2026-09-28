"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { homeChipIcons } from "@/lib/home-chips";
import type { AccessPoint } from "@/components/access/AccessPointsList";
import type { ActionChipTile } from "@/components/home/HomeActionStrip";

type QuickTile = {
  id: string;
  name: string;
  icon: IconName;
  status: string;
  tone?: "danger" | "success" | "muted";
  action?: string | null;
  deviceId?: string | null;
  latch?: "OPEN" | "CLOSED";
};

function chipIcon(name: string): IconName {
  return (homeChipIcons as readonly string[]).includes(name) ? (name as IconName) : "settings";
}

function guestsLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 0) return "Нет гостей";
  if (mod10 === 1 && mod100 !== 11) return `${count} активный`;
  return `${count} активных`;
}

function pagesOf(items: QuickTile[]) {
  const pages: QuickTile[][] = [];
  for (let index = 0; index < items.length; index += 4) pages.push(items.slice(index, index + 4));
  return pages;
}

export function HomeQuickGrid({
  points,
  chips,
  guestCount = 0,
  securityStatus = "Норма",
  onSelect,
}: {
  points: AccessPoint[];
  chips: ActionChipTile[];
  guestCount?: number;
  securityStatus?: string;
  onSelect: (chip: ActionChipTile) => void;
}) {
  const [index, setIndex] = useState(0);
  const extras = chips.filter((chip) => chip.action !== "open-gate" && chip.action !== "open-point" && chip.action !== "pay");
  const tiles: QuickTile[] = [
    ...points.map((point) => {
      const open = point.latch === "OPEN";
      return {
        id: point.id,
        name: point.name,
        icon: /калитк|lock|замок/i.test(point.name) ? ("lock" as const) : ("gate" as const),
        status: point.status ?? (open ? "Открыто" : "Закрыто"),
        tone: open ? ("danger" as const) : ("success" as const),
        action: "open-point",
        deviceId: point.id,
        latch: point.latch,
      };
    }),
    ...extras.map((chip) => ({
      id: chip.id,
      name: chip.name,
      icon: chipIcon(chip.icon),
      status:
        chip.action === "security"
          ? securityStatus
          : chip.action === "guests"
            ? guestsLabel(guestCount)
            : chip.stale
              ? "Нет связи"
              : chip.latch === "OPEN"
                ? "Открыто"
                : chip.latch === "CLOSED"
                  ? "Закрыто"
                  : "",
      tone: chip.action === "security" && securityStatus === "Тревога" ? ("danger" as const) : ("muted" as const),
      action: chip.action,
      deviceId: chip.deviceId,
      latch: chip.latch,
    })),
  ];
  const pages = pagesOf(tiles);

  useEffect(() => {
    setIndex(0);
  }, [tiles.length]);

  if (!tiles.length) return null;

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.clientWidth;
    setIndex(Math.round(target.scrollLeft / Math.max(width, 1)));
  }

  return (
    <section aria-label="Быстрые кнопки">
      <div className="home-quick-film" onScroll={onScroll}>
        {pages.map((page, pageIndex) => (
          <div key={pageIndex} className="home-quick-page" role="list">
            {page.map((tile) => (
              <button
                key={tile.id}
                type="button"
                role="listitem"
                className="home-quick-tile"
                onClick={() =>
                  onSelect({
                    id: tile.id,
                    name: tile.name,
                    icon: tile.icon,
                    kind: "ACTION",
                    action: tile.action,
                    deviceId: tile.deviceId,
                    latch: tile.latch,
                  })
                }
              >
                <span className="tile-icon">
                  <Icon name={tile.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[16px] leading-tight text-ink">{tile.name}</span>
                  {tile.status ? (
                    <span className={`mt-0.5 block text-[13px] ${tile.tone === "danger" ? "text-danger" : tile.tone === "success" ? "text-success" : "text-muted"}`}>
                      {tile.status}
                    </span>
                  ) : null}
                </span>
                <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
              </button>
            ))}
          </div>
        ))}
      </div>
      {pages.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {pages.map((_, pageIndex) => (
            <span key={pageIndex} className={`h-1.5 rounded-full transition-all duration-200 ${pageIndex === index ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
