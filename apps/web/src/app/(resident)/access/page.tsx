import { VisitorCard } from "@/components/home/VisitorCard";
import { residentHome } from "@/mocks/resident-home";

export default function AccessPage() {
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Доступ</h1>
      <p className="mt-2 text-[15px] text-muted">
        {residentHome.object.name} · {residentHome.unit.name}
      </p>
      <div className="mt-8">
        <VisitorCard title={residentHome.visitor.title} detail={residentHome.visitor.detail} />
      </div>
    </section>
  );
}
