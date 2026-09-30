"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { useAdminPreview } from "@/components/admin/AdminPreview";

export function EditObjectButton({
  object,
  compact = false,
  iconOnly = false,
}: {
  object: {
    id: string;
    name: string;
    address: string;
    securityPhone?: string | null;
    residentSeesProjectCameras?: boolean;
  };
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(object.name);
  const [address, setAddress] = useState(object.address);
  const [securityPhone, setSecurityPhone] = useState(object.securityPhone ?? "");
  const [shareCameras, setShareCameras] = useState(Boolean(object.residentSeesProjectCameras));
  const [error, setError] = useState<string | null>(null);

  function fill() {
    setName(object.name);
    setAddress(object.address);
    setSecurityPhone(object.securityPhone ?? "");
    setShareCameras(Boolean(object.residentSeesProjectCameras));
    setError(null);
  }

  function close() {
    setOpen(false);
    fill();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/catalog/objects/${object.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, address, securityPhone, residentSeesProjectCameras: shareCameras }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={iconOnly ? "btn btn-secondary btn-icon" : `btn btn-secondary ${compact ? "btn-compact" : ""}`}
        aria-label={iconOnly ? "Редактировать" : undefined}
        onClick={() => {
          fill();
          setOpen(true);
        }}
      >
        {iconOnly ? <Icon name="edit" /> : "Изменить"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-object-title"
            className="panel fade-in w-full max-w-md rounded-t-[28px] p-6 sm:rounded-[28px]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="edit-object-title" className="text-[24px] tracking-[-0.03em] text-ink">
                Проект
              </h2>
              <button type="button" onClick={close} aria-label="Закрыть" className="btn btn-secondary btn-icon">
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="mt-6">
              <label className="block">
                <span className="text-sm text-muted">Название</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" />
              </label>
              <label className="mt-4 block">
                <span className="text-sm text-muted">Адрес</span>
                <input value={address} onChange={(event) => setAddress(event.target.value)} className="control mt-2" />
              </label>
              <label className="mt-4 block">
                <span className="text-sm text-muted">Телефон охраны</span>
                <input value={securityPhone} onChange={(event) => setSecurityPhone(event.target.value)} className="control mt-2" type="tel" inputMode="tel" placeholder="+7…" />
              </label>
              <label className="mt-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={shareCameras}
                  onChange={(event) => setShareCameras(event.target.checked)}
                />
                <span className="text-sm text-ink">
                  Жильцы видят камеры проекта
                  <span className="mt-1 block text-[13px] text-muted">Общие камеры посёлка. Камеры дома житель видит и без этой отметки.</span>
                </span>
              </label>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="mt-6 btn btn-primary btn-block">
                Сохранить
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function DeleteObjectButton({
  objectId,
  canDelete,
  compact = false,
}: {
  objectId: string;
  canDelete: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { can } = useAdminPreview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!can("objects.delete")) return null;

  async function onDelete() {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/catalog/objects/${objectId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось удалить");
      return;
    }
    router.refresh();
    router.push("/admin/objects");
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button type="button" className={`btn btn-secondary ${compact ? "btn-compact" : ""}`} disabled={!canDelete || busy} onClick={() => void onDelete()}>
        Удалить
      </button>
      {!canDelete ? <p className="mt-2 text-sm text-muted">Объект с людьми удалить нельзя.</p> : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

