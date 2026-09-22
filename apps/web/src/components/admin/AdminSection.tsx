export function AdminSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="max-w-xl">
      <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">{title}</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">{text}</p>
    </section>
  );
}
