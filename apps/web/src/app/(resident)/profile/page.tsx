import Link from "next/link";
import { PushButton } from "@/components/pwa/PushButton";
import { ThemePalette } from "@/components/shell/ThemePalette";
import { profileView } from "@/server/access";

export default async function ProfilePage() {
  const profile = await profileView();
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">{profile.name}</h1>
      {profile.place ? <p className="mt-3 text-[17px] text-graphite">{profile.place}</p> : null}
      {profile.notices.length > 0 ? (
        <ul className="mt-8 divide-y divide-line panel">
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
        <Link href="/my-objects" className="btn btn-secondary mt-8">
          Мои объекты
        </Link>
      ) : null}
      {profile.adminMembershipId ? (
        <form action="/api/session/membership" method="post" className="mt-4">
          <input type="hidden" name="membershipId" value={profile.adminMembershipId} />
          <button type="submit" className="btn btn-secondary">
            Администрирование
          </button>
        </form>
      ) : null}
      <ThemePalette />
      <div className="mt-8">
        <PushButton />
      </div>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="mt-10 btn btn-secondary"
        >
          Выйти
        </button>
      </form>
    </section>
  );
}
