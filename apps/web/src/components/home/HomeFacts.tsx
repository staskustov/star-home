type Facts = {
  lights: { on: number; total: number } | null;
  doors: { open: string[] } | null;
  energy: { watts?: number; kwh?: number } | null;
  alerts: string[];
};

export function HomeFacts({ facts }: { facts?: Facts }) {
  if (!facts) return null;
  const rows = [
    facts.lights ? { key: "lights", title: "Свет", detail: `${facts.lights.on} из ${facts.lights.total} включено` } : null,
    facts.doors ? { key: "doors", title: "Двери", detail: facts.doors.open.length ? `Открыто: ${facts.doors.open.join(", ")}` : "Все закрыты" } : null,
    facts.energy
      ? {
          key: "energy",
          title: "Энергия",
          detail: [typeof facts.energy.watts === "number" ? `${facts.energy.watts} Вт` : null, typeof facts.energy.kwh === "number" ? `${facts.energy.kwh} кВт·ч` : null]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    facts.alerts.length ? { key: "alerts", title: "Тревоги", detail: facts.alerts.join(". ") } : null,
  ].filter((row): row is { key: string; title: string; detail: string } => Boolean(row));
  if (!rows.length) return null;
  return (
    <section aria-label="Сейчас">
      <h2 className="mb-3 text-[19px] tracking-[-0.02em] text-ink">Сейчас</h2>
      <ul className="panel overflow-hidden">
        {rows.map((row) => (
          <li key={row.key} className="list-row">
            <span className="flex-1 text-[15px] text-ink">{row.title}</span>
            <span className="text-[13px] text-muted">{row.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
