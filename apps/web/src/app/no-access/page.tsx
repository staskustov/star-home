import { redirect } from "next/navigation";
import { rpc } from "@/server/rpc";
import { readSession } from "@/server/session";

export default async function NoAccessPage() {
  const session = await readSession();
  if (!session) redirect("/");
  const destination = await rpc<{ redirectTo?: string }>("destination");
  if (destination.body.redirectTo && destination.body.redirectTo !== "/no-access") redirect(destination.body.redirectTo);

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-[15px] tracking-[0.22em] text-ink">STAR HOME</p>
        <h1 className="mt-6 text-[28px] tracking-[-0.03em] text-ink">Нет объектов</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Сейчас для этого входа нет открытого дома или действующего пропуска.
        </p>
        <form action="/api/auth/logout" method="post" className="mt-8">
          <button type="submit" className="h-12 rounded-[14px] bg-accent px-5 text-[15px] text-accent-contrast">
            Выйти
          </button>
        </form>
      </div>
    </main>
  );
}
