"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { homeChipActions, homeChipIcons } from "@/lib/home-chips";
import { Select } from "@/components/ui/Select";

type Chip = {
  id: string;
  name: string;
  icon: string;
  strip: "scenarios" | "actions";
  kind: "LIFE_MODE" | "SCENARIO" | "ACTION";
  locked?: boolean;
  scenarioId?: string | null;
  action?: string | null;
};

const actionLabels: Record<(typeof homeChipActions)[number], string> = {
  "open-gate": "Ворота",
  "open-point": "Точка доступа",
  guests: "Гости",
  security: "Охрана",
  service: "Сервис",
  pay: "Оплатить",
  "lights-off": "Выключить свет",
  "curtains-close": "Закрыть шторы",
  night: "Ночь",
};

export function HomeChipEditor({
  objectId,
  chips,
  scenarios,
  canEdit,
}: {
  objectId: string;
  chips: { scenarios: Chip[]; actions: Chip[] };
  scenarios: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<(typeof homeChipIcons)[number]>("night");
  const [strip, setStrip] = useState<"scenarios" | "actions">("scenarios");
  const [scenarioId, setScenarioId] = useState("");
  const [action, setAction] = useState<(typeof homeChipActions)[number] | "">("");
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setNotice(null);
    const response = await fetch("/api/home-chips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId,
        name,
        icon,
        strip,
        scenarioId: scenarioId || null,
        action: action || null,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setNotice(payload?.message ?? "Не удалось добавить");
      return;
    }
    setName("");
    setScenarioId("");
    setAction("");
    setNotice("Плитка добавлена. Житель включает её в настройках главного экрана.");
    router.refresh();
  }

  async function remove(chipId: string) {
    setNotice(null);
    const response = await fetch("/api/home-chips", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId, chipId }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setNotice(payload?.message ?? "Не удалось удалить");
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-12">
      <h2 className="text-[24px] tracking-[-0.03em] text-ink">Сценарии и кнопки жителя</h2>
      <p className="mt-2 text-[15px] text-muted">Дома, на работе, в отпуске и ночь уже есть. Здесь добавляются свои плитки: иконка, название и сценарий автоматизации.</p>
      <ChipList title="Сценарии" items={chips.scenarios} canEdit={canEdit} onRemove={remove} />
      <ChipList title="Быстрые кнопки" items={chips.actions} canEdit={canEdit} onRemove={remove} />
      {canEdit ? (
        <form
          className="panel mt-6 space-y-4 px-5 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="text-[17px] text-ink">Новая плитка</p>
          <label className="block">
            <span className="text-[13px] text-muted">Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-1 w-full" maxLength={24} />
          </label>
          <fieldset>
            <legend className="text-[13px] text-muted">Иконка</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {homeChipIcons.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={icon === item}
                  onClick={() => setIcon(item)}
                  className={`rounded-2xl border px-3 py-2 ${icon === item ? "border-ink bg-ink text-white" : "border-[var(--panel-line)] text-graphite"}`}
                >
                  <Icon name={item as IconName} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-[13px] text-muted">Блок</span>
            <Select value={strip} onChange={(event) => setStrip(event.target.value as "scenarios" | "actions")} wrapClassName="mt-1 w-full">
              <option value="scenarios">Сценарии</option>
              <option value="actions">Быстрые кнопки</option>
            </Select>
          </label>
          <label className="block">
            <span className="text-[13px] text-muted">Сценарий автоматизации</span>
            <Select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} wrapClassName="mt-1 w-full">
              <option value="">Не привязывать</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-[13px] text-muted">Или готовая кнопка</span>
            <Select value={action} onChange={(event) => setAction(event.target.value as typeof action)} wrapClassName="mt-1 w-full">
              <option value="">Не выбирать</option>
              {homeChipActions
                .filter((item) => item !== "open-gate")
                .map((item) => (
                  <option key={item} value={item}>
                    {actionLabels[item]}
                  </option>
                ))}
            </Select>
          </label>
          <button type="submit" className="btn btn-primary">
            Добавить плитку
          </button>
        </form>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function ChipList({
  title,
  items,
  canEdit,
  onRemove,
}: {
  title: string;
  items: Chip[];
  canEdit: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-[17px] text-ink">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((chip) => (
          <li key={chip.id} className="panel flex items-center gap-3 px-4 py-3">
            <Icon name={((homeChipIcons as readonly string[]).includes(chip.icon) ? chip.icon : "settings") as IconName} className="h-5 w-5" />
            <span className="min-w-0 flex-1 text-[15px] text-ink">{chip.name}</span>
            {chip.locked ? <span className="text-[13px] text-muted">Системная</span> : null}
            {canEdit && !chip.locked ? (
              <button type="button" className="text-[14px] text-muted" onClick={() => onRemove(chip.id)}>
                Удалить
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
