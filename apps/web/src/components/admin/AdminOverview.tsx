"use client";

import Link from "next/link";
import { AddObjectButton } from "@/components/admin/ObjectDraftSheet";
import { AdminStats } from "@/components/admin/AdminStats";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { EventList } from "@/components/admin/EventList";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { objectPresentation } from "@/lib/object-presentation";

export function AdminOverview() {
  const { selected, objects } = useAdminPreview();
  const totals = {
    objects: objects.length,
    residents: objects.reduce((sum, object) => sum + object.residents, 0),
    visitors: objects.reduce((sum, object) => sum + object.visitors, 0),
    requests: objects.reduce((sum, object) => sum + object.requests, 0),
    alarms: objects.reduce((sum, object) => sum + object.alarms, 0),
  };
  if (!selected) {
    return (
      <div>
        <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Объекты</h1>
        <p className="mt-4 text-[17px] text-muted">В компании пока нет объектов.</p>
        <div className="mt-6">
          <AddObjectButton />
        </div>
      </div>
    );
  }
  const presentation = objectPresentation[selected.type];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard value={String(totals.objects)} label="Объекты" />
        <MetricCard value={String(totals.residents)} label="Жители" />
        <MetricCard value={String(totals.visitors)} label="Гости" />
        <MetricCard value={String(totals.requests)} label="Заявки" />
        <MetricCard value={String(totals.alarms)} label="Тревоги" tone={totals.alarms > 0 ? "danger" : "info"} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">{selected.name}</h1>
          <p className="mt-3 text-[15px] text-muted">{presentation.label}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/objects/${selected.id}`}
            className="inline-flex h-12 items-center rounded-[14px] border border-line px-5 text-[15px] text-ink"
          >
            Структура
          </Link>
          <AddObjectButton />
        </div>
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
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[20px] border border-line bg-surface px-5 py-5">
          <h2 className="text-[20px] tracking-[-0.03em] text-ink">Заявки</h2>
          {selected.openRequests.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Открытых заявок нет.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {selected.openRequests.map((request) => (
                <li key={request.id} className="py-3">
                  <p className="text-[15px] text-ink">{request.title}</p>
                  <p className="text-sm text-muted">{request.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-[20px] border border-line bg-surface px-5 py-5">
          <h2 className="text-[20px] tracking-[-0.03em] text-ink">Уведомления</h2>
          {selected.notices.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Уведомлений нет.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {selected.notices.map((notice) => (
                <li key={notice.id} className="py-3">
                  <p className="text-[15px] text-ink">{notice.title}</p>
                  <p className="text-sm text-muted">{notice.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
