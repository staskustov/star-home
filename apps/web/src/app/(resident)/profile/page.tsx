import Link from "next/link";
import { profileView } from "@/server/access";

export default async function ProfilePage() {
  const profile = await profileView();
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">{profile.name}</h1>
      {profile.place ? <p className="mt-3 text-[17px] text-graphite">{profile.place}</p> : null}
      {profile.notices.length > 0 ? (
        <ul className="mt-8 divide-y divide-line rounded-[20px] border border-line bg-surface">
          {profile.notices.map((notice) => (
            <li key={notice.id} className="px-5 py-4">
              <p className="text-[16px] text-ink">{notice.title}</p>
              <p className="text-sm text-muted">
                {notice.body} · {notice.at}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {profile.choosePlaces ? (
        <Link href="/my-objects" className="mt-8 block text-[15px] text-ink">
          Мои объекты
        </Link>
      ) : null}
      {profile.adminMembershipId ? (
        <form action="/api/session/membership" method="post" className="mt-4">
          <input type="hidden" name="membershipId" value={profile.adminMembershipId} />
          <button type="submit" className="text-[15px] text-ink">
            Администрирование
          </button>
        </form>
      ) : null}
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="mt-10 inline-flex h-12 items-center rounded-[14px] border border-line bg-surface px-5 text-[15px] text-ink"
        >
          Выйти
        </button>
      </form>
    </section>
  );
}
