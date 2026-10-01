"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { NavItem } from "@/types/domain";

export function BottomNavigation({ items, dock }: { items: NavItem[]; dock: string[] }) {
  const pathname = usePathname();
  const main = items.filter((item) => dock.includes(item.href));

  return (
    <nav aria-label="Разделы" className="dock md:hidden">
      <ul className="mx-auto grid max-w-[680px]" style={{ gridTemplateColumns: `repeat(${main.length}, minmax(0, 1fr))` }}>
        {main.map((item) => {
          const active = pathname === item.href || (item.href !== "/home" && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={`dock-link ${active ? "is-active" : ""}`}>
                <Icon name={item.icon} className="h-[22px] w-[22px]" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
