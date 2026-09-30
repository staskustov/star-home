"use client";

import { Icon } from "@/components/icons";
import { RequestPanel } from "@/components/service/RequestPanel";

const fallbackCategories = ["Электричество", "Вода", "Отопление", "Уборка", "Территория", "Охрана", "Интернет", "Ремонт", "Другое"];

export function ServiceDialog({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: string[];
}) {
  const topics = categories?.length ? categories : fallbackCategories;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-dialog-title"
        className="panel fade-in max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] p-5 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="service-dialog-title" className="text-[24px] tracking-[-0.03em] text-ink">
              Сервис
            </h2>
            <p className="mt-1 text-[13px] text-muted">Заявка по объекту, без перехода с главной.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon">
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-5">
          <RequestPanel categories={topics} compact onCreated={onClose} />
        </div>
      </div>
    </div>
  );
}
