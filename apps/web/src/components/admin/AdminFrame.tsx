"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { Icon } from "@/components/icons";
import { ObjectSwitcher } from "@/components/home/ObjectSwitcher";
import { AppShell } from "@/components/shell/AppShell";

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const preview = useAdminPreview();
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;

  return (
    <AppShell
      variant="admin"
      sidebar={
        <aside className="sticky top-0 h-dvh border-r border-line bg-surface">
          <AdminSidebar labels="from-lg" />
        </aside>
      }
    >
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 px-5 py-4 backdrop-blur lg:px-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-line md:hidden"
            aria-label="Меню"
            onClick={() => setMenuPath(pathname)}
          >
            <Icon name="menu" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{preview.actorLabel}</p>
            <p className="truncate text-[17px] text-ink">{preview.companyName}</p>
          </div>
          <div className="hidden min-w-0 sm:block">
            <ObjectSwitcher objects={preview.objects} value={preview.selectedId} onChange={preview.select} />
          </div>
        </div>
        <div className="mt-3 sm:hidden">
          <ObjectSwitcher objects={preview.objects} value={preview.selectedId} onChange={preview.select} />
        </div>
      </header>
      <div className="px-5 py-6 lg:px-10 lg:py-8">{children}</div>
      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Закрыть меню" onClick={() => setMenuPath(null)} />
          <div className="absolute inset-y-0 left-0 w-[280px] overflow-y-auto bg-surface">
            <AdminSidebar />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
