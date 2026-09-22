export function Header({ mark, title, meta }: { mark?: string; title: string; meta?: string }) {
  return (
    <header>
      {mark ? <p className="text-[13px] font-semibold tracking-[0.22em] text-accent">{mark}</p> : null}
      <h1 suppressHydrationWarning className={`${mark ? "mt-6" : ""} text-[32px] leading-[1.15] tracking-[-0.03em] text-ink sm:text-[36px]`}>
        {title}
      </h1>
      {meta ? <p className="mt-2 text-[15px] text-muted">{meta}</p> : null}
    </header>
  );
}
