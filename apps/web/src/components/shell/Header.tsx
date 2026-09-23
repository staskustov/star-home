export function Header({ mark, title, meta }: { mark?: string; title: string; meta?: string }) {
  return (
    <header>
      {mark ? <p className="kicker text-accent">{mark}</p> : null}
      <h1 suppressHydrationWarning className={`${mark ? "mt-5" : ""} text-[34px] leading-[1.08] tracking-[-0.045em] text-ink sm:text-[40px]`}>
        {title}
      </h1>
      {meta ? <p className="mt-3 text-[16px] text-graphite">{meta}</p> : null}
    </header>
  );
}
