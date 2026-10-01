"use client";

import { StarLogo } from "@/components/brand/StarLogo";
import { ResponsiveContainer } from "@/components/shell/ResponsiveContainer";
import { ResidentNavProvider, useResidentNav } from "@/components/shell/ResidentNavContext";
import { TopBarActions } from "@/components/shell/TopBarActions";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/types/domain";

function ResidentChromeInner({
  sidebar,
  bottomNav,
  menuItems,
  children,
}: {
  sidebar?: React.ReactNode;
  bottomNav?: React.ReactNode;
  menuItems?: NavItem[];
  children: React.ReactNode;
}) {
  const cover = usePathname() === "/home";
  const { expanded } = useResidentNav();

  return (
    <div
      className={`min-h-dvh md:grid ${expanded ? "md:grid-cols-[220px_minmax(0,1fr)]" : "md:grid-cols-[72px_minmax(0,1fr)]"} ${
        cover ? "resident-cover" : ""
      }`}
    >
      <div className="hidden md:block">{sidebar}</div>
      <div className="min-w-0">
        <header className="resident-header sticky top-0 z-20 flex items-center justify-between gap-3 overflow-visible border-b border-line/60 bg-bg px-5 py-3 md:justify-end md:px-8">
          <p className="flex min-w-0 items-center gap-2 text-[15px] font-medium tracking-[-0.02em] text-ink md:hidden">
            <StarLogo className="h-[18px] w-[18px] shrink-0" />
            STAR HOME
          </p>
          <TopBarActions menuItems={menuItems} />
        </header>
        <div
          className={`resident-main mx-auto w-full pb-32 md:max-w-none md:px-8 md:pt-6 md:pb-16 ${
            cover ? "max-w-none px-0 pt-0 md:px-8" : "max-w-[680px] px-5 pt-6"
          }`}
        >
          {children}
        </div>
      </div>
      <div className="md:hidden">{bottomNav}</div>
    </div>
  );
}

export function ResidentChrome({
  sidebar,
  bottomNav,
  menuItems,
  children,
}: {
  sidebar?: React.ReactNode;
  bottomNav?: React.ReactNode;
  menuItems?: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <ResidentNavProvider>
      <ResidentChromeInner sidebar={sidebar} bottomNav={bottomNav} menuItems={menuItems}>
        {children}
      </ResidentChromeInner>
    </ResidentNavProvider>
  );
}

export function AuthChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-stage flex min-h-dvh items-center justify-center px-5 py-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/house-dusk.jpg" alt="" className="auth-photo" />
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </main>
  );
}
