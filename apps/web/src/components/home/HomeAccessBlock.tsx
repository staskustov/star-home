import { AccessPointsList, type AccessPoint } from "@/components/access/AccessPointsList";

export function HomeAccessBlock({ points, canCommand = false }: { points: AccessPoint[]; canCommand?: boolean }) {
  if (points.length === 0) return null;
  return (
    <section aria-label="Доступ">
      <AccessPointsList points={points} canCommand={canCommand} compact />
    </section>
  );
}
