import { StarMark } from "@/components/brand/StarMark";
import { AppShell } from "@/components/shell/AppShell";
import { BottomNavigation } from "@/components/shell/BottomNavigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { residentDock, residentNav } from "@/config/navigation";

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      variant="resident"
      sidebar={
        <aside className="glass-rail sticky top-0 flex h-dvh flex-col border-r px-4 py-8">
          <p className="flex items-center gap-2 px-3 text-[13px] font-medium tracking-[0.24em] text-ink">
            <StarMark className="h-4 w-4 text-accent" />
            STAR HOME
          </p>
          <div className="mt-10">
            <Sidebar items={residentNav} />
          </div>
        </aside>
      }
      bottomNav={<BottomNavigation items={residentNav} dock={residentDock} />}
    >
      {children}
    </AppShell>
  );
}
