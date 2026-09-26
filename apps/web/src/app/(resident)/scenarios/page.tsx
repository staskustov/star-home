import { ScenarioList } from "@/components/home/ScenarioList";
import { requireHome, requireScenarios } from "@/server/access";

export default async function ScenariosPage() {
  const home = await requireHome();
  const scenarios = await requireScenarios();
  return (
    <section>
      <h1 className="text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">Сценарии</h1>
      <p className="mt-2 text-[15px] text-muted">
        {home.object.name} · {home.unit.name}
      </p>
      <ScenarioList scenarios={scenarios} devices={home.devices} />
    </section>
  );
}
