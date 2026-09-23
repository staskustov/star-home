export function VisitorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="panel px-5 py-4">
      <h3 className="text-[17px] text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </article>
  );
}
