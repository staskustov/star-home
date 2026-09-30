import { AuthChrome, ResidentChrome } from "@/components/shell/ResidentChrome";
import type { NavItem } from "@/types/domain";

export function AppShell({
  variant,
  sidebar,
  bottomNav,
  menuItems,
  children,
}: {
  variant: "auth" | "resident" | "admin";
  sidebar?: React.ReactNode;
  bottomNav?: React.ReactNode;
  menuItems?: NavItem[];
  children: React.ReactNode;
}) {
  if (variant === "auth") return <AuthChrome>{children}</AuthChrome>;
  if (variant === "resident") {
    return (
      <ResidentChrome sidebar={sidebar} bottomNav={bottomNav} menuItems={menuItems}>
        {children}
      </ResidentChrome>
    );
  }
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="hidden md:block">{sidebar}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
