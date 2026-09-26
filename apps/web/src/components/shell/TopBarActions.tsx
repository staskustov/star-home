import { AccountActions } from "@/components/shell/AccountActions";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function TopBarActions() {
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <AccountActions />
      <form action="/api/auth/logout" method="post" className="hidden lg:block">
        <button type="submit" className="btn btn-secondary btn-compact">
          Выйти
        </button>
      </form>
    </div>
  );
}
