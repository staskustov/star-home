"use client";

import { useState, type UIEvent } from "react";
import { HomeDialog } from "@/components/home/HomeDialog";
import { HomeSection } from "@/components/home/HomeSection";
import { Icon, type IconName } from "@/components/icons";
import { homeChipIcons } from "@/lib/home-chips";
import type { AccessPoint } from "@/components/access/AccessPointsList";
import type { ActionChipTile } from "@/components/home/HomeActionStrip";

const tilesPerPage = 4;

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

function shortPointName(name: string) {
  const next = name.replace(/^Главные\s+/i, "").trim();
  if (!next) return name;
  return next.charAt(0).toLocaleUpperCase("ru") + next.slice(1);
}

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

function QuickTileButton({ tile, onSelect }: { tile: QuickTile; onSelect: (chip: ActionChipTile) => void }) {
  return (
    <button
      type="button"
      className="home-quick-tile w-full"
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
      <span className="quick-text">
        <span className="quick-name">{tile.name}</span>
        {tile.status ? (
          <span className={`quick-status ${tile.tone === "danger" ? "text-danger" : tile.tone === "success" ? "text-success" : "text-muted"}`}>
            {tile.status}
          </span>
        ) : null}
      </span>
      <Icon name="chevron" className="quick-chevron" />
    </button>
  );
}

export function HomeQuickGrid({
  points,
  chips,
  guestCount = 0,
  securityStatus = "Норма",
  serviceStatus = "",
  onSelect,
}: {
  points: AccessPoint[];
  chips: ActionChipTile[];
  guestCount?: number;
  securityStatus?: string;
  serviceStatus?: string;
  onSelect: (chip: ActionChipTile) => void;
}) {
  const [page, setPage] = useState(0);
  const [allOpen, setAllOpen] = useState(false);
  const extras = chips.filter(
    (chip) =>
      chip.action !== "open-gate" &&
      chip.action !== "open-point" &&
      chip.action !== "pay" &&
      chip.action !== "security" &&
      chip.action !== "guests" &&
      chip.action !== "service",
  );
  const byAction = (action: string) => chips.find((chip) => chip.action === action);
  const defaults: QuickTile[] = [
    {
      id: byAction("security")?.id ?? "security",
      name: "Охрана",
      icon: "security",
      status: securityStatus,
      tone: securityStatus === "Тревога" ? "danger" : "muted",
      action: "security",
    },
    {
      id: byAction("guests")?.id ?? "guests",
      name: "Гости",
      icon: "guests",
      status: guestsLabel(guestCount),
      tone: "muted",
      action: "guests",
    },
    {
      id: byAction("service")?.id ?? "service",
      name: "Сервис",
      icon: "service",
      status: serviceStatus,
      tone: "muted",
      action: "service",
    },
  ];
  const tiles: QuickTile[] = [
    ...points.map((point) => {
      const open = point.latch === "OPEN";
      return {
        id: point.id,
        name: shortPointName(point.name),
        icon: /калитк|lock|замок/i.test(point.name) ? ("lock" as const) : ("gate" as const),
        status: point.status ?? (open ? "Открыто" : "Закрыто"),
        tone: open ? ("danger" as const) : ("success" as const),
        action: "open-point",
        deviceId: point.id,
        latch: point.latch,
      };
    }),
    ...defaults,
    ...extras.map((chip) => ({
      id: chip.id,
      name: chip.name,
      icon: chipIcon(chip.icon),
      status: chip.stale ? "Нет связи" : chip.latch === "OPEN" ? "Открыто" : chip.latch === "CLOSED" ? "Закрыто" : "",
      tone: "muted" as const,
      action: chip.action,
      deviceId: chip.deviceId,
      latch: chip.latch,
    })),
  ];
  if (!tiles.length) return null;

  const pages: QuickTile[][] = [];
  for (let start = 0; start < tiles.length; start += tilesPerPage) pages.push(tiles.slice(start, start + tilesPerPage));
  const activePage = Math.min(page, pages.length - 1);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const next = Math.round(target.scrollLeft / Math.max(target.clientWidth, 1));
    if (next !== page) setPage(next);
  }

  function pick(chip: ActionChipTile) {
    setAllOpen(false);
    onSelect(chip);
  }

  return (
    <HomeSection title="Быстрые действия" linkLabel="Все действия" onAction={() => setAllOpen(true)} className="home-quick">
      <div className="quick-pages" role="list" aria-label="Быстрые действия" onScroll={onScroll}>
        {pages.map((items, index) => (
          <div key={index} className="quick-page">
            {items.map((tile) => (
              <div key={tile.id} role="listitem" className="quick-cell">
                <QuickTileButton tile={tile} onSelect={onSelect} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {pages.length > 1 ? (
        <div className="quick-dots" aria-hidden>
          {pages.map((_, index) => (
            <span key={index} className={`h-1.5 rounded-full transition-all duration-200 ${index === activePage ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`} />
          ))}
        </div>
      ) : null}
      {allOpen ? (
        <HomeDialog title="Все действия" onClose={() => setAllOpen(false)}>
          <div className="quick-all" role="list">
            {tiles.map((tile) => (
              <div key={tile.id} role="listitem" className="min-w-0">
                <QuickTileButton tile={tile} onSelect={pick} />
              </div>
            ))}
          </div>
        </HomeDialog>
      ) : null}
    </HomeSection>
  );
}
