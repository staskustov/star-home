import { AccountActions } from "@/components/shell/AccountActions";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { NavItem } from "@/types/domain";

export function TopBarActions({ menuItems }: { menuItems?: NavItem[] }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ThemeToggle />
      <AccountActions menuItems={menuItems} />
    </div>
  );
}
