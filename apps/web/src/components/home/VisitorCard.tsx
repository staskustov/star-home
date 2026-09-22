export function VisitorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="rounded-[20px] border border-line bg-surface px-5 py-4">
      <h3 className="text-[17px] text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </article>
  );
}
