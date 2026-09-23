import { requireGuest } from "@/server/access";
import { passQr } from "@/server/pass-qr";

export default async function GuestPage() {
  const guest = await requireGuest();
  const qr = guest.pass?.code ? await passQr(guest.pass.code) : "";
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <section className="w-full max-w-sm">
        <p className="text-[15px] tracking-[0.22em] text-ink">STAR HOME</p>
        <h1 className="mt-6 text-[32px] tracking-[-0.03em] text-ink">{guest.name}</h1>
        {guest.pass ? (
          <article className="mt-8 panel px-5 py-4">
            <p className="text-[17px] text-ink">{guest.pass.guestName}</p>
            <p className="mt-1 text-sm text-muted">{guest.pass.detail}</p>
            {guest.pass.code ? <p className="mt-3 text-[20px] tracking-[0.18em] text-ink">{guest.pass.code}</p> : null}
            {qr ? <div className="mt-4 w-32 bg-white" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
          </article>
        ) : (
          <p className="mt-8 text-[15px] text-muted">Пропуск не найден.</p>
        )}
        <form action="/api/auth/logout" method="post" className="mt-8">
          <button type="submit" className="btn btn-primary">
            Выйти
          </button>
        </form>
      </section>
    </main>
  );
}
