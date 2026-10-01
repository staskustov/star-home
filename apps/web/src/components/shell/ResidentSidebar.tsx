"use client";

import { StarMark } from "@/components/brand/StarMark";
import { Icon } from "@/components/icons";
import { Sidebar } from "@/components/shell/Sidebar";
import { useResidentNav } from "@/components/shell/ResidentNavContext";
import type { NavItem } from "@/types/domain";

export function ResidentSidebar({ items }: { items: NavItem[] }) {
  const { expanded, toggle } = useResidentNav();

  return (
    <aside
      className={`glass-rail sticky top-0 flex h-dvh flex-col border-r py-5 transition-[width,padding] duration-200 ${
        expanded ? "w-[220px] px-4" : "w-[72px] items-center px-2"
      }`}
    >
      <div className={`flex w-full items-center ${expanded ? "justify-between gap-2" : "flex-col gap-3"}`}>
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium tracking-[0.24em] text-ink">
          <StarMark className="h-4 w-4 shrink-0 text-accent" />
          {expanded ? <span className="truncate">STAR HOME</span> : <span className="sr-only">STAR HOME</span>}
        </p>
        <button
          type="button"
          className="btn-icon shrink-0"
          aria-expanded={expanded}
          aria-label={expanded ? "Свернуть меню" : "Развернуть меню"}
          onClick={toggle}
        >
          <Icon name="chevron" className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : "-rotate-90"}`} />
        </button>
      </div>
      <div className={`mt-8 min-h-0 w-full flex-1 overflow-y-auto ${expanded ? "" : "px-0"}`}>
        <Sidebar items={items} labels={expanded ? "always" : "never"} />
      </div>
    </aside>
  );
}
