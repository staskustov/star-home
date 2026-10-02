import Link from "next/link";
import { Icon } from "@/components/icons";

export function HomeSection({
  title,
  href,
  linkLabel,
  onAction,
  aside,
  className = "",
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  onAction?: () => void;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const label = (
    <>
      {linkLabel ?? "Все"}
      <Icon name="chevron" className="h-3.5 w-3.5" />
    </>
  );

  return (
    <section aria-label={title} className={`home-section ${className}`}>
      <div className="home-section-head">
        <h2 className="home-section-title">{title}</h2>
        {aside}
        {onAction ? (
          <button type="button" className="home-section-link" onClick={onAction}>
            {label}
          </button>
        ) : href ? (
          <Link href={href} className="home-section-link">
            {label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
