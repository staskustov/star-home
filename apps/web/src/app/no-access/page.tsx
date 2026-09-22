import { redirect } from "next/navigation";
import { destinationFor } from "@/server/routing";
import { readSession } from "@/server/session";

export default async function NoAccessPage() {
  const session = await readSession();
  if (!session) redirect("/");
  const destination = destinationFor(session.userId, session.membershipId);
  if (destination !== "/no-access") redirect(destination);

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-[15px] tracking-[0.22em] text-ink">STAR HOME</p>
        <h1 className="mt-6 text-[28px] tracking-[-0.03em] text-ink">Нет объектов</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Администратор ещё не закрепил за вами дом или квартиру.
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
