"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { objectPresentation } from "@/lib/object-presentation";
import { objectTypes, type ObjectType } from "@/types/domain";
import { useAdminPreview } from "@/components/admin/AdminPreview";

export function AddObjectButton() {
  const { addObject } = useAdminPreview();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ObjectType>("COTTAGE_COMMUNITY");
  const [error, setError] = useState<string | null>(null);
  const presentation = objectPresentation[type];

  function close() {
    setOpen(false);
    setError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    addObject({ name, type });
    setName("");
    setType("COTTAGE_COMMUNITY");
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 rounded-[14px] bg-accent px-5 text-[15px] text-accent-contrast"
      >
        Добавить объект
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 sm:items-center" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-object-title"
            className="fade-in w-full max-w-md rounded-t-[24px] bg-surface p-6 sm:rounded-[24px]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="new-object-title" className="text-[24px] tracking-[-0.03em] text-ink">
                Новый объект
              </h2>
              <button type="button" onClick={close} aria-label="Закрыть" className="text-muted">
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="mt-6">
              <label className="block">
                <span className="text-sm text-muted">Название</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-sm text-muted">Тип</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as ObjectType)}
                  className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-bg px-3 text-base text-ink outline-none focus:border-accent"
                >
                  {objectTypes.map((item) => (
                    <option key={item} value={item}>
                      {objectPresentation[item].label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-3 text-sm text-muted">Структура: {presentation.structureHint}</p>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="mt-6 h-12 w-full rounded-[14px] bg-accent text-accent-contrast">
                Создать
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
