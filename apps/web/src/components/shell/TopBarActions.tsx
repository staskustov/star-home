import Link from "next/link";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function TopBarActions() {
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <Link href="/profile" className="btn btn-secondary btn-icon" aria-label="Личный кабинет">
        <Icon name="profile" />
      </Link>
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="btn btn-secondary btn-compact">
          Выйти
        </button>
      </form>
    </div>
  );
}
