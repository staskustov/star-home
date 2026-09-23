"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/Select";
import { objectPresentation } from "@/lib/object-presentation";
import { objectTypes, type ObjectType } from "@/types/domain";
import { useAdminPreview } from "@/components/admin/AdminPreview";

export function AddObjectButton() {
  const { select } = useAdminPreview();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<ObjectType>("COTTAGE_COMMUNITY");
  const [error, setError] = useState<string | null>(null);
  const presentation = objectPresentation[type];

  function close() {
    setOpen(false);
    setError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/catalog/objects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type, address }),
    });
    const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok || !payload?.id) {
      setError(payload?.message ?? "Не удалось сохранить");
      return;
    }
    select(payload.id);
    setName("");
    setAddress("");
    setType("COTTAGE_COMMUNITY");
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        Добавить объект
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-object-title"
            className="panel fade-in w-full max-w-md rounded-t-[28px] p-6 sm:rounded-[28px]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="new-object-title" className="text-[24px] tracking-[-0.03em] text-ink">
                Новый объект
              </h2>
              <button type="button" onClick={close} aria-label="Закрыть" className="btn btn-secondary btn-icon">
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="mt-6">
              <label className="block">
                <span className="text-sm text-muted">Название</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="control mt-2"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-sm text-muted">Тип</span>
                <Select wrapClassName="mt-2" value={type} onChange={(event) => setType(event.target.value as ObjectType)}>
                  {objectTypes.map((item) => (
                    <option key={item} value={item}>
                      {objectPresentation[item].label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="mt-4 block">
                <span className="text-sm text-muted">Адрес</span>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="control mt-2"
                />
              </label>
              <p className="mt-3 text-sm text-muted">Структура: {presentation.structureHint}</p>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="mt-6 btn btn-primary btn-block">
                Создать
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
