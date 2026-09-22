import { AppShell } from "@/components/shell/AppShell";
import { BottomNavigation } from "@/components/shell/BottomNavigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { residentNav } from "@/config/navigation";

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      variant="resident"
      sidebar={
        <aside className="sticky top-0 flex h-dvh flex-col border-r border-line bg-surface px-4 py-8">
          <p className="px-3 text-[13px] font-semibold tracking-[0.22em] text-accent">STAR HOME</p>
          <div className="mt-10">
            <Sidebar items={residentNav} />
          </div>
        </aside>
      }
      bottomNav={<BottomNavigation items={residentNav} />}
    >
      {children}
    </AppShell>
  );
}
