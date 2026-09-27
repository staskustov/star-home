import { AccessPointsList, type AccessPoint } from "@/components/access/AccessPointsList";

export function HomeAccessBlock({ points, canCommand = false }: { points: AccessPoint[]; canCommand?: boolean }) {
  if (points.length === 0) return null;
  return (
    <section aria-label="Доступ">
      <h2 className="text-[17px] tracking-[-0.02em] text-ink">Доступ</h2>
      <AccessPointsList points={points} canCommand={canCommand} />
    </section>
  );
}
