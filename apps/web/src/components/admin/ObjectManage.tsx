"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { useAdminPreview } from "@/components/admin/AdminPreview";

export function EditObjectButton({
  object,
  compact = false,
}: {
  object: { id: string; name: string; address: string };
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(object.name);
  const [address, setAddress] = useState(object.address);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setName(object.name);
    setAddress(object.address);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/catalog/objects/${object.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, address }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return;
    }
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-secondary ${compact ? "btn-compact" : ""}`}
        onClick={() => {
          setName(object.name);
          setAddress(object.address);
          setError(null);
          setOpen(true);
        }}
      >
        Изменить
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
                Объект
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
  const { selectedId, select, objects } = useAdminPreview();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (canDelete === false) {
      setError("Объект с людьми удалить нельзя.");
      return;
    }
    if (!pending) {
      setPending(true);
      setError(null);
      return;
    }
    const response = await fetch(`/api/catalog/objects/${objectId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setPending(false);
      setError(payload?.message ?? "Не удалось удалить");
      return;
    }
    if (selectedId === objectId) {
      const next = objects.find((item) => item.id !== objectId);
      if (next) select(next.id);
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" className={`btn btn-danger ${compact ? "btn-compact" : ""}`} onClick={remove}>
        {pending ? "Подтвердить удаление" : "Удалить"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
