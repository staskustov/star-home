import { VisitorCard } from "@/components/home/VisitorCard";
import { requireHome } from "@/server/access";

export default async function AccessPage() {
  const home = await requireHome();
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Доступ</h1>
      <p className="mt-2 text-[15px] text-muted">
        {home.object.name} · {home.unit.name}
      </p>
      <div className="mt-8">
        {home.visitor ? (
          <VisitorCard title={home.visitor.title} detail={home.visitor.detail} />
        ) : (
          <p className="text-[15px] text-muted">Гостей нет.</p>
        )}
      </div>
    </section>
  );
}
