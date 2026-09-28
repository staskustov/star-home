"use client";

import { StarLogo } from "@/components/brand/StarLogo";
import { ResponsiveContainer } from "@/components/shell/ResponsiveContainer";
import { TopBarActions } from "@/components/shell/TopBarActions";
import { usePathname } from "next/navigation";

export function ResidentChrome({
  sidebar,
  bottomNav,
  children,
}: {
  sidebar?: React.ReactNode;
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cover = usePathname() === "/home";
  return (
    <div className={`min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)] ${cover ? "resident-cover" : ""}`}>
      <div className="hidden lg:block">{sidebar}</div>
      <div className="min-w-0">
        <header className="resident-header sticky top-0 z-20 flex items-center justify-between gap-3 overflow-visible border-b border-line/60 bg-bg px-5 py-3 lg:justify-end lg:px-8">
          <p className="flex min-w-0 items-center gap-2 text-[15px] font-medium tracking-[-0.02em] text-ink lg:hidden">
            <StarLogo className="h-8 w-8 shrink-0" />
            Star Home
          </p>
          <TopBarActions />
        </header>
        <div
          className={`resident-main mx-auto w-full max-w-[680px] pb-32 lg:px-10 lg:pt-8 lg:pb-16 ${cover ? "px-0 pt-0" : "px-5 pt-6"}`}
        >
          {children}
        </div>
      </div>
      <div className="lg:hidden">{bottomNav}</div>
    </div>
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
