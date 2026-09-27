"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { homeChipIcons } from "@/lib/home-chips";

type Chip = {
  id: string;
  name: string;
  icon: string;
  strip: "scenarios" | "actions";
};

function chipIcon(name: string): IconName {
  return (homeChipIcons as readonly string[]).includes(name) ? (name as IconName) : "settings";
}

export function HomeScreenSettings({
  scenarioIds,
  actionIds,
  scenarios,
  actions,
}: {
  scenarioIds: string[];
  actionIds: string[];
  scenarios: Chip[];
  actions: Chip[];
}) {
  const router = useRouter();
  const [selectedScenarios, setSelectedScenarios] = useState(scenarioIds);
  const [selectedActions, setSelectedActions] = useState(actionIds);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(id: string, strip: "scenarios" | "actions") {
    const set = strip === "scenarios" ? setSelectedScenarios : setSelectedActions;
    set((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    const response = await fetch("/api/home-layout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioIds: selectedScenarios, actionIds: selectedActions }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    setSaving(false);
    if (!response.ok) {
      setNotice(payload?.message ?? "Не удалось сохранить");
      return;
    }
    setNotice("Сохранено.");
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-[22px] tracking-[-0.03em] text-ink">Главный экран</h2>
      <p className="mt-2 text-[15px] text-muted">Выберите сценарии и быстрые кнопки. Если плиток много, на главной их можно прокрутить.</p>
      <ChipPicker title="Сценарии" chips={scenarios} selected={selectedScenarios} onToggle={(id) => toggle(id, "scenarios")} />
      <ChipPicker title="Быстрые кнопки" chips={actions} selected={selectedActions} onToggle={(id) => toggle(id, "actions")} />
      <button type="button" className="btn mt-6" disabled={saving} onClick={() => void save()}>
        Сохранить главный экран
      </button>
      {notice ? (
        <p role="status" className="mt-3 text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function ChipPicker({
  title,
  chips,
  selected,
  onToggle,
}: {
  title: string;
  chips: Chip[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-[17px] text-ink">{title}</h3>
      <ul className="mt-3 space-y-2">
        {chips.map((chip) => {
          const on = selected.includes(chip.id);
          return (
            <li key={chip.id}>
              <label className="panel flex cursor-pointer items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={on} onChange={() => onToggle(chip.id)} className="h-4 w-4" />
                <Icon name={chipIcon(chip.icon)} className="h-5 w-5 text-graphite" />
                <span className="text-[15px] text-ink">{chip.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
