"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { NavItem } from "@/types/domain";

export function BottomNavigation({ items, dock }: { items: NavItem[]; dock: string[] }) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const main = items.filter((item) => dock.includes(item.href));
  const rest = items.filter((item) => !dock.includes(item.href));
  const restActive = rest.some((item) => item.href === pathname);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label="Закрыть меню" onClick={() => setMenuPath(null)} />
          <div id="more-menu" className="sheet fade-in">
            <ul>
              {rest.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={`sheet-link ${pathname === item.href ? "is-active" : ""}`}
                  >
                    <span className="tile-icon">
                      <Icon name={item.icon} className="h-[18px] w-[18px]" />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-line/60 px-1 pt-4">
              <ThemeToggle />
              <form action="/api/auth/logout" method="post" className="flex-1">
                <button type="submit" className="btn btn-secondary btn-block">
                  Выйти
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      <nav aria-label="Разделы" className="dock lg:hidden">
        <ul className="mx-auto grid max-w-[680px]" style={{ gridTemplateColumns: `repeat(${main.length + 1}, minmax(0, 1fr))` }}>
          {main.map((item) => {
            const active = pathname === item.href && !open;
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={`dock-link ${active ? "is-active" : ""}`}>
                  <Icon name={item.icon} className="h-[22px] w-[22px]" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="more-menu"
              onClick={() => setMenuPath(open ? null : pathname)}
              className={`dock-link w-full ${open || restActive ? "is-active" : ""}`}
            >
              <Icon name={open ? "close" : "menu"} className="h-[22px] w-[22px]" />
              Меню
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
