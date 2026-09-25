"use client";

import Link from "next/link";
import { AddObjectButton } from "@/components/admin/ObjectDraftSheet";
import { DeleteObjectButton, EditObjectButton } from "@/components/admin/ObjectManage";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { Icon } from "@/components/icons";
import type { DashboardObject, DashboardTone, DashboardView } from "@/types/dashboard";

const toneText: Record<DashboardTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const toneDot: Record<DashboardTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function Dot({ tone, live = false }: { tone: DashboardTone; live?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
      {live ? <span className={`absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping ${toneDot[tone]}`} /> : null}
      <span className={`relative h-2 w-2 rounded-full ${toneDot[tone]}`} />
    </span>
  );
}

function ObjectStrip({ objects, selectedId, onSelect }: { objects: DashboardObject[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Объекты">
      {objects.map((object) => {
        const active = object.id === selectedId;
        return (
          <button
            key={object.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(object.id)}
            className={`panel flex items-center gap-4 px-5 py-4 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 ${
              active ? "border-accent/50" : ""
            }`}
          >
            <Dot tone={object.status.tone} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">{object.name}</span>
              <span className="block truncate text-[13px] text-muted">{object.typeLabel}</span>
            </span>
            <span className={`shrink-0 text-[13px] ${toneText[object.status.tone]}`}>{object.status.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function Attention({ object }: { object: DashboardObject }) {
  return (
    <section className="panel px-6 py-6" aria-labelledby="attention-title">
      <h2 id="attention-title" className="text-[20px] tracking-[-0.03em] text-ink">
        Требует внимания
      </h2>
      {object.attention.length === 0 ? (
        <p className="mt-6 flex items-center gap-3 text-[15px] text-muted">
          <Dot tone="success" />
          Сейчас ничего не требует вашего решения.
        </p>
      ) : (
        <ul className="mt-4">
          {object.attention.map((item) => (
            <li key={item.id} className="border-t border-line/60 first:border-t-0">
              <Link href={item.href} className="group flex items-center gap-4 py-4">
                <Dot tone={item.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] text-ink first-letter:uppercase">{item.title}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">{item.detail}</span>
                </span>
                <Icon name="chevron" className="h-4 w-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Pulse({ object }: { object: DashboardObject }) {
  if (object.pulse.length === 0) return null;
  return (
    <section className="panel px-6 py-6" aria-labelledby="pulse-title">
      <h2 id="pulse-title" className="text-[20px] tracking-[-0.03em] text-ink">
        Пульс
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6">
        {object.pulse.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="group block">
              <span className={`block text-[34px] leading-none font-light tracking-[-0.04em] tabular-nums ${item.alert ? "text-danger" : "text-ink"}`}>
                {item.value}
              </span>
              <span className="mt-2 block text-[13px] text-muted transition-colors group-hover:text-ink">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Systems({ object }: { object: DashboardObject }) {
  if (!object.systems) return null;
  return (
    <section className="panel px-6 py-5" aria-labelledby="systems-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="systems-title" className="text-[20px] tracking-[-0.03em] text-ink">
          Системы
        </h2>
        <Link href="/admin/devices" className="text-[13px] text-muted transition-colors hover:text-ink">
          Все устройства
        </Link>
      </div>
      {object.systems.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted">Системы ещё не подключены.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {object.systems.map((system) => (
            <li key={system.id} className="border-l border-line/70 pl-4">
              <p className="text-[13px] text-muted">{system.name}</p>
              <p className={`mt-1.5 flex items-center gap-2 text-[15px] ${toneText[system.tone]}`}>
                <Dot tone={system.tone} />
                {system.state}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Feed({ object }: { object: DashboardObject }) {
  if (!object.feed) return null;
  return (
    <section className="panel px-6 py-6" aria-labelledby="feed-title">
      <h2 id="feed-title" className="text-[20px] tracking-[-0.03em] text-ink">
        Последние события
      </h2>
      {object.feed.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted">Событий пока нет.</p>
      ) : (
        <ol className="mt-4">
          {object.feed.map((item) => (
            <li key={item.id} className="flex items-baseline gap-5 border-t border-line/60 py-3.5 first:border-t-0">
              <span className="w-[92px] shrink-0 text-[13px] text-muted tabular-nums">{item.at}</span>
              <span className="relative top-[-1px]">
                <Dot tone={item.tone} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[15px] text-ink">{item.title}</span>
                <span className="ml-3 text-[13px] text-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AdminDashboard({ view }: { view: DashboardView }) {
  const { selectedId, select, can } = useAdminPreview();
  const object = view.objects.find((item) => item.id === selectedId) ?? view.objects[0];
  const canEditObject = view.canEditObject || can("objects.edit");
  const canDeleteObject = view.canDeleteObject || can("objects.delete");

  if (!object) {
    return (
      <div>
        <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Объекты</h1>
        <p className="mt-4 text-[17px] text-muted">Объектов пока нет.</p>
        {view.canCreateObject ? (
          <div className="mt-6">
            <AddObjectButton />
          </div>
        ) : null}
      </div>
    );
  }

  const place = [object.typeLabel, object.address].filter(Boolean).join(" · ");

  return (
    <div className="fade-in mx-auto max-w-[1180px] space-y-6">
      {view.scope === "COMPANY" && view.objects.length > 1 ? (
        <ObjectStrip objects={view.objects} selectedId={object.id} onSelect={select} />
      ) : null}
      <header className="flex flex-wrap items-end justify-between gap-6 pt-4 pb-2">
        <div className="min-w-0">
          <p className="kicker text-muted">{place}</p>
          <h1 className="mt-3 text-[44px] leading-[1.02] tracking-[-0.045em] text-ink">{object.name}</h1>
          <p className="mt-5 flex items-center gap-3" role="status">
            <Dot tone={object.status.tone} live={object.status.tone === "danger"} />
            <span className={`text-[22px] tracking-[-0.02em] ${toneText[object.status.tone]}`}>{object.status.title}</span>
          </p>
          <p className="mt-1.5 pl-5 text-[15px] text-muted first-letter:uppercase">{object.status.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canEditObject ? <EditObjectButton object={object} /> : null}
          {view.canEditStructure ? (
            <Link href={`/admin/objects/${object.id}`} className="btn btn-secondary">
              Структура
            </Link>
          ) : null}
          {view.canCreateObject ? <AddObjectButton /> : null}
          {canDeleteObject ? <DeleteObjectButton objectId={object.id} canDelete={object.canDelete !== false} /> : null}
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Attention object={object} />
        <Pulse object={object} />
      </div>
      <Systems object={object} />
      <Feed object={object} />
    </div>
  );
}
