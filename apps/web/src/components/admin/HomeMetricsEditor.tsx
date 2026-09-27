"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { Select } from "@/components/ui/Select";

type Metric = {
  key: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  sort: number;
};

type CatalogItem = { key: string; label: string; icon: string; color: string };

const icons = ["thermo", "drop", "wind", "radiation", "co2", "organics", "climate", "leak"] as const;

export function HomeMetricsEditor({
  objectId,
  items,
  available,
  canEdit,
}: {
  objectId: string;
  items: Metric[];
  available: CatalogItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [unused, setUnused] = useState(available);
  const [addKey, setAddKey] = useState(available[0]?.key ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  function patch(key: string, next: Partial<Metric>) {
    setRows((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }

  function add() {
    const catalog = unused.find((item) => item.key === addKey);
    if (!catalog) return;
    setRows((current) => [
      ...current,
      { key: catalog.key, label: catalog.label, icon: catalog.icon, color: catalog.color, enabled: true, sort: (current.length + 1) * 10 },
    ]);
    const next = unused.filter((item) => item.key !== catalog.key);
    setUnused(next);
    setAddKey(next[0]?.key ?? "");
  }

  async function save() {
    setNotice(null);
    const response = await fetch("/api/home-metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId, items: rows }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setNotice(payload?.message ?? "Не удалось сохранить");
      return;
    }
    setNotice("Показатели сохранены.");
    router.refresh();
  }

  return (
    <section className="mt-12">
      <h2 className="text-[24px] tracking-[-0.03em] text-ink">Показатели на главной</h2>
      <p className="mt-2 text-[15px] text-muted">Цвет и иконка для температуры, влажности, ветра, радиации, CO₂ и органики. Новое значение появится, когда датчик его пришлёт.</p>
      <ul className="mt-5 space-y-3">
        {rows.map((item) => (
          <li key={item.key} className="panel space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[15px] text-ink">
                <input type="checkbox" checked={item.enabled} disabled={!canEdit} onChange={(event) => patch(item.key, { enabled: event.target.checked })} />
                {item.label}
              </label>
              <span className="weather-metric" style={{ color: item.color }}>
                <Icon name={(icons.includes(item.icon as (typeof icons)[number]) ? item.icon : "thermo") as IconName} className="h-4 w-4" />
                {item.label}
              </span>
            </div>
            <label className="block">
              <span className="text-[13px] text-muted">Название</span>
              <input value={item.label} disabled={!canEdit} onChange={(event) => patch(item.key, { label: event.target.value })} className="control mt-1 w-full" maxLength={24} />
            </label>
            <fieldset>
              <legend className="text-[13px] text-muted">Иконка</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {icons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={item.icon === icon}
                    onClick={() => patch(item.key, { icon })}
                    className={`rounded-2xl border px-3 py-2 ${item.icon === icon ? "border-ink bg-ink text-white" : "border-[var(--panel-line)] text-graphite"}`}
                  >
                    <Icon name={icon} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-[13px] text-muted">Цвет</span>
              <span className="mt-1 flex items-center gap-3">
                <input type="color" value={item.color} disabled={!canEdit} onChange={(event) => patch(item.key, { color: event.target.value })} className="h-10 w-14 cursor-pointer rounded-xl border border-line bg-transparent p-1" />
                <input value={item.color} disabled={!canEdit} onChange={(event) => patch(item.key, { color: event.target.value })} className="control w-32" maxLength={7} />
              </span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && unused.length ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="text-[13px] text-muted">Добавить показатель</span>
            <Select value={addKey} onChange={(event) => setAddKey(event.target.value)} wrapClassName="mt-1 w-full">
              {unused.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={add}>
            Добавить
          </button>
        </div>
      ) : null}
      {canEdit ? (
        <button type="button" className="btn btn-primary mt-5" onClick={() => void save()}>
          Сохранить показатели
        </button>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
