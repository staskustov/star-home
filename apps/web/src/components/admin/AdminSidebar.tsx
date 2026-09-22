import { Sidebar } from "@/components/shell/Sidebar";
import { adminNav } from "@/config/navigation";

export function AdminSidebar({ labels = "always" }: { labels?: "always" | "from-lg" }) {
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <p className="px-3 text-[13px] font-semibold tracking-[0.18em] text-accent">
        <span className={labels === "from-lg" ? "hidden lg:inline" : ""}>STAR HOME</span>
        {labels === "from-lg" ? <span className="lg:hidden">SH</span> : null}
      </p>
      <div className="mt-8">
        <Sidebar items={adminNav} labels={labels} />
      </div>
    </div>
  );
}
