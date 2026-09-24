"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { NavItem } from "@/types/domain";

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  items,
  labels = "always",
}: {
  items: NavItem[];
  labels?: "always" | "from-lg";
}) {
  const pathname = usePathname();
  const labelClass = labels === "from-lg" ? "sr-only lg:not-sr-only" : "";
  const linkClass = labels === "from-lg" ? "justify-center px-0 lg:justify-start lg:px-3" : "";

  return (
    <nav aria-label="Разделы">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium tracking-[-0.01em] transition-colors duration-200 ${
                  active ? "bg-accent/15 text-ink" : "text-muted hover:bg-surface-muted/50 hover:text-ink"
                } ${linkClass}`}
              >
                <Icon name={item.icon} />
                <span className={labelClass}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
