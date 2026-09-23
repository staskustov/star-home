"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { NavItem } from "@/types/domain";

export function BottomNavigation({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы" className="dock lg:hidden">
      <ul className="mx-auto grid max-w-[680px] grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href;
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
