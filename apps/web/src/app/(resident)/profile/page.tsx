import Link from "next/link";
import { HomeScreenSettings } from "@/components/home/HomeScreenSettings";
import { PushButton } from "@/components/pwa/PushButton";
import { ProfilePhoto } from "@/components/shell/ProfilePhoto";
import { ThemePalette } from "@/components/shell/ThemePalette";
import { profileView } from "@/server/access";

export default async function ProfilePage() {
  const profile = await profileView();
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Настройки</h1>
      <p className="mt-3 text-[22px] tracking-[-0.02em] text-ink">{profile.name}</p>
      {profile.place ? <p className="mt-2 text-[17px] text-graphite">{profile.place}</p> : null}
      <ProfilePhoto name={profile.name} photo={profile.photo} />
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
      {profile.homeLayout ? (
        <HomeScreenSettings
          scenarioIds={profile.homeLayout.scenarioIds}
          actionIds={profile.homeLayout.actionIds}
          scenarios={profile.homeLayout.scenarios}
          actions={profile.homeLayout.actions}
        />
      ) : null}
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
