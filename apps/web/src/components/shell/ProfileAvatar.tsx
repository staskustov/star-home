import Link from "next/link";

export function ProfileAvatar({ name, photo }: { name: string; photo?: string | null }) {
  const initial = name.trim().slice(0, 1) || "·";
  return (
    <Link href="/profile" aria-label="Настройки" className="avatar overflow-hidden">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </Link>
  );
}
