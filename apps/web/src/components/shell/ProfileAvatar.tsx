"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { NavItem } from "@/types/domain";

export function ProfileAvatar({
  name,
  photo,
  menuItems = [],
}: {
  name: string;
  photo?: string | null;
  menuItems?: NavItem[];
}) {
  const pathname = usePathname();
  const initial = name.trim().slice(0, 1) || "·";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const face = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" className="h-full w-full object-cover" />
  ) : (
    initial
  );

  if (!menuItems.length) {
    return (
      <Link href="/profile" aria-label="Настройки" className="avatar overflow-hidden">
        {face}
      </Link>
    );
  }

  return (
    <div className="relative">
      <button type="button" className="avatar overflow-hidden md:hidden" aria-label="Меню жителя" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {face}
      </button>
      <Link href="/profile" aria-label="Настройки" className="avatar hidden overflow-hidden md:flex">
        {face}
      </Link>
      {open ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
          <div id="resident-menu" className="sheet fade-in">
            <ul>
              {menuItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={`sheet-link ${pathname === item.href ? "is-active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="tile-icon">
                      <Icon name={item.icon} className="h-[18px] w-[18px]" />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <form action="/api/auth/logout" method="post" className="mt-3 border-t border-line/60 px-1 pt-4">
              <button type="submit" className="btn btn-secondary btn-block">
                Выйти
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
