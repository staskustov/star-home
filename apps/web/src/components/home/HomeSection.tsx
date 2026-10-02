import Link from "next/link";
import { Icon } from "@/components/icons";

export function HomeSection({
  title,
  href,
  linkLabel,
  aside,
  className = "",
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={`home-section ${className}`}>
      <div className="home-section-head">
        <h2 className="home-section-title">{title}</h2>
        {aside}
        {href ? (
          <Link href={href} className="home-section-link">
            {linkLabel ?? "Все"}
            <Icon name="chevron" className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
