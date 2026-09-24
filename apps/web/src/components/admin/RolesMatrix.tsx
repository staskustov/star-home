"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Permission } from "@/server/rbac/permissions";
import type { Role } from "@/types/domain";
import type { RoleColumn, RolesBoard } from "@/types/roles";

type Drafts = Partial<Record<Role, Permission[]>>;

function same(left: Permission[], right: Permission[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((item) => set.has(item));
}

function Mark({ on }: { on: boolean }) {
  return on ? (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 10.5l3.2 3.2L15 7" />
    </svg>
  ) : null;
}

function Cell({
  role,
  permission,
  granted,
  onToggle,
}: {
  role: RoleColumn;
  permission: { id: Permission; label: string };
  granted: boolean;
  onToggle: () => void;
}) {
  if (!role.ceiling.includes(permission.id)) {
    return (
      <span className="text-[15px] text-muted/50" aria-label="Недоступно для роли">
        —
      </span>
    );
  }
  const locked = role.locked.includes(permission.id);
  if (!role.editable || locked) {
    return (
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${granted ? "bg-ink/10 text-ink" : "border border-line/70"}`}
        aria-label={granted ? "Есть" : "Нет"}
        title={locked ? "Обязательное право" : undefined}
      >
        <Mark on={granted} />
      </span>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={granted}
      aria-label={`${role.label}: ${permission.label}`}
      onClick={onToggle}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-150 ${
        granted ? "bg-accent text-accent-contrast" : "border border-ink/30 hover:border-ink/60"
      }`}
    >
      <Mark on={granted} />
    </button>
  );
}

export function RolesMatrix({ board }: { board: RolesBoard }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Drafts>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const grantedOf = (role: RoleColumn): Permission[] => drafts[role.value] ?? role.granted;
  const changed = useMemo(
    () => board.roles.filter((role) => drafts[role.value] && !same(drafts[role.value] ?? [], role.granted)),
    [board.roles, drafts],
  );

  function toggle(role: RoleColumn, permission: Permission) {
    setNotice(null);
    const current = grantedOf(role);
    const next = current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission];
    setDrafts((all) => ({ ...all, [role.value]: next }));
  }

  function standard(role: RoleColumn) {
    setNotice(null);
    setDrafts((all) => ({ ...all, [role.value]: role.ceiling }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    for (const role of changed) {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: role.value, permissions: drafts[role.value] }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(`${role.label}: ${payload?.message ?? "не удалось сохранить"}`);
        setBusy(false);
        router.refresh();
        return;
      }
    }
    setBusy(false);
    setDrafts({});
    setNotice("Права сохранены и действуют сразу.");
    router.refresh();
  }

  const staffColumns = board.roles.filter((role) => !role.household);
  const householdColumns = board.roles.filter((role) => role.household);
  const columns = [...staffColumns, ...householdColumns];

  return (
    <div className="fade-in mx-auto max-w-[1240px] pb-28">
      <header className="pt-4">
        <p className="kicker text-muted">Управление</p>
        <h1 className="mt-3 text-[44px] leading-[1.02] tracking-[-0.045em] text-ink">Роли и права</h1>
        <p className="mt-3 max-w-[640px] text-[15px] text-muted">
          {board.canEdit
            ? "Снимите лишние права с ролей вашей компании. Выдать можно только то, что роль допускает в STAR HOME."
            : "Что может каждая роль в вашей компании."}
        </p>
      </header>

      <section className="panel mt-8 overflow-x-auto" aria-label="Матрица прав">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line/60 align-bottom">
              <th scope="col" className="w-[260px] px-6 py-4 text-[12px] font-normal tracking-[0.08em] text-muted uppercase">
                Право
              </th>
              {columns.map((role, index) => (
                <th
                  key={role.value}
                  scope="col"
                  className={`px-2 py-4 text-center align-bottom font-normal ${index === staffColumns.length ? "border-l border-line/60" : ""}`}
                >
                  <span className="block text-[13px] leading-tight text-ink">{role.label}</span>
                  <span className="mt-1 block h-4 text-[11px] text-muted">
                    {role.household ? "дом" : drafts[role.value] && !same(drafts[role.value] ?? [], role.granted) ? "изменено" : role.customized ? "настроено" : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.groups.map((group) => (
              <Fragment key={group.id}>
                <tr>
                  <th colSpan={columns.length + 1} scope="colgroup" className="px-6 pt-6 pb-2 text-[12px] font-normal tracking-[0.08em] text-muted uppercase">
                    {group.label}
                  </th>
                </tr>
                {group.items.map((permission) => (
                  <tr key={permission.id} className="border-t border-line/40 transition-colors hover:bg-surface-muted/25">
                    <th scope="row" className="px-6 py-2.5 text-[14px] font-normal text-ink">
                      {permission.label}
                    </th>
                    {columns.map((role, index) => (
                      <td key={role.value} className={`px-2 py-2.5 text-center ${index === staffColumns.length ? "border-l border-line/60" : ""}`}>
                        <Cell role={role} permission={permission} granted={grantedOf(role).includes(permission.id)} onToggle={() => toggle(role, permission.id)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {board.canEdit ? (
            <tfoot>
              <tr className="border-t border-line/60">
                <td className="px-6 py-4 text-[13px] text-muted">Вернуть права по умолчанию</td>
                {columns.map((role, index) => (
                  <td key={role.value} className={`px-2 py-4 text-center ${index === staffColumns.length ? "border-l border-line/60" : ""}`}>
                    {role.editable && (role.customized || drafts[role.value]) && !same(grantedOf(role), role.ceiling) ? (
                      <button type="button" onClick={() => standard(role)} className="text-[13px] text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                        Сбросить
                      </button>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </section>

      <p className="mt-4 text-[13px] text-muted">
        — право недоступно для роли. Права жителей, семьи и гостей задаёт STAR HOME, их видно для справки.
      </p>

      {notice ? (
        <p role="status" className="mt-4 text-[15px] text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-[15px] text-danger">
          {error}
        </p>
      ) : null}

      {changed.length > 0 ? (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-6">
          <div className="panel fade-in flex items-center gap-6 rounded-full px-6 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
            <p className="text-[14px] text-ink">
              Изменено: {changed.map((role) => role.label).join(", ")}
            </p>
            <button type="button" disabled={busy} onClick={() => setDrafts({})} className="btn btn-secondary btn-compact disabled:opacity-50">
              Отменить
            </button>
            <button type="button" disabled={busy} onClick={() => void save()} className="btn btn-primary btn-compact disabled:opacity-50">
              Сохранить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
