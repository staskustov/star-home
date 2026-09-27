"use client";

import { Icon } from "@/components/icons";
import { GuestPassForm } from "@/components/access/GuestPassForm";

export function GuestPassDialog({
  open,
  onClose,
  canCreate,
}: {
  open: boolean;
  onClose: () => void;
  canCreate: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-pass-title"
        className="panel fade-in w-full max-w-lg rounded-t-[28px] p-5 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="guest-pass-title" className="text-[24px] tracking-[-0.03em] text-ink">
              Гость
            </h2>
            <p className="mt-1 text-[13px] text-muted">Пропуск с точным сроком от и до.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon">
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-5">
          {canCreate ? <GuestPassForm compact onDone={onClose} /> : <p className="text-[15px] text-muted">Пропуск оформляет житель.</p>}
        </div>
      </div>
    </div>
  );
}
