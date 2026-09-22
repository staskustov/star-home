"use client";

import { AddObjectButton } from "@/components/admin/ObjectDraftSheet";
import { AdminStats } from "@/components/admin/AdminStats";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { EventList } from "@/components/admin/EventList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { objectPresentation } from "@/lib/object-presentation";

export function AdminOverview() {
  const { selected } = useAdminPreview();
  const presentation = objectPresentation[selected.type];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">{selected.name}</h1>
          <p className="mt-3 text-[15px] text-muted">{presentation.label}</p>
        </div>
        <AddObjectButton />
      </div>
      <AdminStats object={selected} />
      <div className="grid gap-4 lg:grid-cols-2">
        <EventList events={selected.accessEvents} />
        <section className="rounded-[20px] border border-line bg-surface px-5 py-5">
          <h2 className="text-[20px] tracking-[-0.03em] text-ink">Состояние систем</h2>
          {selected.systems.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Системы ещё не подключены.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {selected.systems.map((system) => (
                <li key={system.id} className="flex items-center justify-between py-3">
                  <span className="text-[15px] text-ink">{system.name}</span>
                  <StatusBadge tone={system.tone}>{system.state}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
