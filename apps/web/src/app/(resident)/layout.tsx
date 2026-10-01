import { AppShell } from "@/components/shell/AppShell";
import { BottomNavigation } from "@/components/shell/BottomNavigation";
import { ResidentSidebar } from "@/components/shell/ResidentSidebar";
import { residentDock, residentNav } from "@/config/navigation";

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      variant="resident"
      sidebar={<ResidentSidebar items={residentNav} />}
      bottomNav={<BottomNavigation items={residentNav} dock={residentDock} />}
      menuItems={residentNav.filter((item) => !residentDock.includes(item.href))}
    >
      {children}
    </AppShell>
  );
}
