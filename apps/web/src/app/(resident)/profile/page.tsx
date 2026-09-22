import Link from "next/link";
import { residentHome } from "@/mocks/resident-home";

export default function ProfilePage() {
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">{residentHome.residentName}</h1>
      <p className="mt-3 text-[17px] text-graphite">{residentHome.object.name}</p>
      <p className="mt-1 text-[15px] text-muted">{residentHome.unit.name}</p>
      <Link
        href="/"
        className="mt-10 inline-flex h-12 items-center rounded-[14px] border border-line bg-surface px-5 text-[15px] text-ink"
      >
        Выйти
      </Link>
    </section>
  );
}
