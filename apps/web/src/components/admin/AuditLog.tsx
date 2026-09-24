"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import type { AuditBoard, AuditOption, AuditRow } from "@/types/audit";

type FilterKey = "category" | "objectId" | "actorUserId" | "result";

const filterFields: { key: FilterKey; label: string; any: string; options: (board: AuditBoard) => AuditOption[] }[] = [
  { key: "category", label: "Категория", any: "Все категории", options: (board) => board.options.categories },
  { key: "objectId", label: "Объект", any: "Все объекты", options: (board) => board.options.objects },
  { key: "actorUserId", label: "Кто", any: "Все сотрудники", options: (board) => board.options.actors },
  { key: "result", label: "Результат", any: "Любой", options: (board) => board.options.results },
];

const resultTone: Record<AuditRow["result"], string> = {
  SUCCESS: "text-muted",
  DENIED: "text-danger",
  ERROR: "text-warning",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] tracking-[0.06em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-[14px] break-words text-ink">{value}</dd>
    </div>
  );
}

function Entry({ row, open, onToggle }: { row: AuditRow; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-t border-line/40 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="grid w-full grid-cols-[150px_minmax(0,1fr)_110px] items-baseline gap-4 px-6 py-3.5 text-left transition-colors hover:bg-surface-muted/25 max-md:grid-cols-1 max-md:gap-1"
      >
        <span className="text-[13px] text-muted tabular-nums">{row.time}</span>
        <span className="min-w-0">
          <span className="block text-[15px] text-ink">
            {row.action}
            <span className="text-muted"> · {row.target}</span>
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {row.actor}
            {row.role ? `, ${row.role}` : ""} · {row.place}
          </span>
        </span>
        <span className={`text-[13px] md:text-right ${resultTone[row.result]}`}>{row.resultLabel}</span>
      </button>
      {open ? (
        <div className="px-6 pb-5">
          <dl className="grid gap-4 rounded-2xl bg-surface-muted/40 p-5 sm:grid-cols-3">
            <Detail label="Категория" value={row.categoryLabel} />
            <Detail label="Время" value={row.time} />
            <Detail label="Результат" value={row.reason ? `${row.resultLabel}: ${row.reason}` : row.resultLabel} />
            <Detail label="IP" value={row.ip ?? "не определён"} />
            <Detail label="Устройство" value={row.device ?? "не определено"} />
            <Detail label="Место" value={row.place} />
          </dl>
          {row.changes.length > 0 ? (
            <ul className="mt-3 grid gap-1.5 text-[14px]">
              {row.changes.map((change, index) => (
                <li key={`${change.field}-${index}`} className="text-ink">
                  <span className="text-muted">{change.field}:</span> {change.from || "—"} → {change.to || "—"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function AuditLog({ board }: { board: AuditBoard }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function navigate(change: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function download() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/audit/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(board.filters),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Не удалось выгрузить журнал");
      return;
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "audit.csv";
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    router.refresh();
  }

  const filtered = filterFields.some((field) => board.filters[field.key]);

  return (
    <div className="fade-in mx-auto max-w-[1100px] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-6 pt-4">
        <div>
          <p className="kicker text-muted">Управление</p>
          <h1 className="mt-3 text-[44px] leading-[1.02] tracking-[-0.045em] text-ink">Журнал действий</h1>
          <p className="mt-3 max-w-[640px] text-[15px] text-muted">Кто, что и когда сделал в вашей зоне ответственности. Записи нельзя изменить или удалить.</p>
        </div>
        {board.canExport ? (
          <button type="button" disabled={busy || board.total === 0} onClick={() => void download()} className="btn btn-secondary btn-compact disabled:opacity-50">
            {busy ? "Готовим файл…" : "Выгрузить CSV"}
          </button>
        ) : null}
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Фильтры">
        {filterFields.map((field) => {
          const options = field.options(board);
          return (
            <label key={field.key} className="block">
              <span className="text-sm text-muted">{field.label}</span>
              <Select
                wrapClassName="mt-2"
                value={board.filters[field.key] ?? ""}
                disabled={options.length === 0}
                onChange={(event) => navigate({ [field.key]: event.target.value || null, limit: null })}
              >
                <option value="">{field.any}</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          );
        })}
      </section>

      <div className="mt-6 flex items-baseline justify-between gap-4 text-[13px] text-muted">
        <p aria-live="polite">
          {board.total === 0 ? "Записей нет" : `Показано ${Math.min(board.limit, board.total)} из ${board.total}`}
        </p>
        {filtered ? (
          <button
            type="button"
            onClick={() => navigate({ category: null, objectId: null, actorUserId: null, result: null, limit: null })}
            className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            Сбросить фильтры
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}

      <section className="panel mt-3 overflow-hidden" aria-label="Записи журнала">
        {board.entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-[15px] text-muted">{filtered ? "По этим фильтрам ничего не найдено." : "Действий пока не было."}</p>
        ) : (
          <ul>
            {board.entries.map((row) => (
              <Entry key={row.id} row={row} open={open === row.id} onToggle={() => setOpen((current) => (current === row.id ? null : row.id))} />
            ))}
          </ul>
        )}
      </section>

      {board.nextLimit ? (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => navigate({ limit: String(board.nextLimit) })} className="btn btn-secondary btn-compact">
            Показать ещё
          </button>
        </div>
      ) : null}
    </div>
  );
}
