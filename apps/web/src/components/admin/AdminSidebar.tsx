"use client";

import { useAdminPreview } from "@/components/admin/AdminPreview";
import { Sidebar } from "@/components/shell/Sidebar";

export function AdminSidebar({ labels = "always" }: { labels?: "always" | "from-lg" }) {
  const { sections } = useAdminPreview();
  const compact = labels === "from-lg";
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <p className="px-3 text-[13px] font-semibold tracking-[0.18em] text-accent">
        <span className={compact ? "hidden lg:inline" : ""}>STAR HOME</span>
        {compact ? <span className="lg:hidden">SH</span> : null}
      </p>
      <div className="mt-8 space-y-6">
        {sections.map((group) => (
          <div key={group.label}>
            <p className={`mb-2 px-3 text-[11px] font-medium tracking-[0.16em] text-muted/80 uppercase ${compact ? "hidden lg:block" : ""}`}>
              {group.label}
            </p>
            <Sidebar items={group.items} labels={labels} navLabel={group.label} />
          </div>
        ))}
      </div>
    </div>
  );
}
