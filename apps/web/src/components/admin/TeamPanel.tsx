"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/Select";
import type { Role } from "@/types/domain";
import type { TeamBoard, TeamMember } from "@/types/team";

type Draft = { mode: "new" } | { mode: "edit"; member: TeamMember };

const noPlace = "company";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function send(op: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch("/api/admin/team", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, ...body }),
  });
  if (response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? "Не удалось сохранить";
}

function placesFor(board: TeamBoard, role: Role): TeamBoard["places"] {
  const meta = board.roles.find((item) => item.value === role);
  if (!meta) return board.places;
  return board.places.filter((place) => (place.id === null ? meta.companyWide : meta.perObject));
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        autoCapitalize="none"
        onChange={(event) => onChange(event.target.value)}
        className="control mt-2"
      />
    </label>
  );
}

function AccessFields({
  board,
  role,
  place,
  onRole,
  onPlace,
  disabled,
}: {
  board: TeamBoard;
  role: Role;
  place: string;
  onRole: (role: Role) => void;
  onPlace: (place: string) => void;
  disabled: boolean;
}) {
  const places = placesFor(board, role);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-sm text-muted">Роль</span>
        <Select wrapClassName="mt-2" value={role} disabled={disabled} onChange={(event) => onRole(event.target.value as Role)}>
          {board.roles.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="text-sm text-muted">Объект</span>
        <Select wrapClassName="mt-2" value={place} disabled={disabled || places.length <= 1} onChange={(event) => onPlace(event.target.value)}>
          {places.map((item) => (
            <option key={item.id ?? noPlace} value={item.id ?? noPlace}>
              {item.label}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function firstPlace(board: TeamBoard, role: Role): string {
  return placesFor(board, role)[0]?.id ?? noPlace;
}

function NewMember({ board, onDone }: { board: TeamBoard; onDone: () => void }) {
  const firstRole = board.roles.find((item) => item.value === "MANAGER")?.value ?? board.roles[0]?.value ?? "MANAGER";
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>(firstRole);
  const [place, setPlace] = useState(firstPlace(board, firstRole));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickRole(next: Role) {
    setRole(next);
    const allowed = placesFor(board, next);
    if (!allowed.some((item) => (item.id ?? noPlace) === place)) setPlace(allowed[0]?.id ?? noPlace);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const message = await send("add", { name, login, password, email, phone, role, objectId: place === noPlace ? null : place });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Имя и фамилия" value={name} onChange={setName} autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Логин" value={login} onChange={setLogin} autoComplete="off" />
        <Field label="Пароль" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="off" />
        <Field label="Телефон" value={phone} onChange={setPhone} type="tel" autoComplete="off" />
      </div>
      <AccessFields board={board} role={role} place={place} onRole={pickRole} onPlace={setPlace} disabled={false} />
      <p className="text-sm text-muted">Если логин уже есть в компании, человек получит новую роль, а имя и пароль останутся прежними.</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn btn-primary btn-block disabled:opacity-50">
        Добавить сотрудника
      </button>
    </form>
  );
}

function EditMember({ board, member, onDone }: { board: TeamBoard; member: TeamMember; onDone: () => void }) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone);
  const [role, setRole] = useState<Role>(member.role);
  const [place, setPlace] = useState(member.objectId ?? noPlace);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = !member.manageable;
  const roleKnown = board.roles.some((item) => item.value === member.role);

  function pickRole(next: Role) {
    setRole(next);
    const allowed = placesFor(board, next);
    if (!allowed.some((item) => (item.id ?? noPlace) === place)) setPlace(allowed[0]?.id ?? noPlace);
  }

  async function run(op: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const message = await send(op, { membershipId: member.membershipId, ...body });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="kicker text-muted">Данные</h3>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run("edit", { name, email, phone });
          }}
        >
          <Field label="Имя и фамилия" value={name} onChange={setName} disabled={locked || !board.can.edit} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={email} onChange={setEmail} type="email" disabled={locked || !board.can.edit} />
            <Field label="Телефон" value={phone} onChange={setPhone} type="tel" disabled={locked || !board.can.edit} />
          </div>
          <p className="text-sm text-muted">Логин: {member.login}</p>
          {!locked && board.can.edit ? (
            <button type="submit" disabled={busy} className="btn btn-secondary disabled:opacity-50">
              Сохранить данные
            </button>
          ) : null}
        </form>
      </section>

      <section>
        <h3 className="kicker text-muted">Роль и объект</h3>
        <div className="mt-4 space-y-4">
          {roleKnown ? (
            <AccessFields
              board={board}
              role={role}
              place={place}
              onRole={pickRole}
              onPlace={setPlace}
              disabled={locked || (!board.can.assign && !board.can.scope)}
            />
          ) : (
            <p className="text-[15px] text-ink">
              {member.roleLabel} · {member.place}
            </p>
          )}
          {!locked && roleKnown && (board.can.assign || board.can.scope) ? (
            <>
              <p className="text-sm text-muted">После изменения сотрудник выйдет из системы и войдёт уже с новыми правами.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run("access", { role, objectId: place === noPlace ? null : place })}
                className="btn btn-secondary disabled:opacity-50"
              >
                Применить доступ
              </button>
            </>
          ) : null}
        </div>
      </section>

      {!locked && (board.can.block || board.can.remove) ? (
        <section className="border-t border-line/60 pt-6">
          <h3 className="kicker text-muted">Доступ к системе</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {board.can.block ? (
              member.status === "BLOCKED" ? (
                <button type="button" disabled={busy} onClick={() => void run("restore")} className="btn btn-secondary disabled:opacity-50">
                  Восстановить доступ
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void run("block")} className="btn btn-secondary disabled:opacity-50">
                  Заблокировать
                </button>
              )
            ) : null}
            {board.can.remove ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => (confirmRemove ? void run("remove") : setConfirmRemove(true))}
                className={`btn disabled:opacity-50 ${confirmRemove ? "btn-danger" : "btn-secondary"}`}
              >
                {confirmRemove ? "Подтвердить удаление" : "Удалить из команды"}
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-muted">Блокировка сразу завершает все сессии. Удаление отзывает роль, история действий сохраняется.</p>
        </section>
      ) : null}

      {locked ? <p className="text-sm text-muted">{member.self ? "Свой доступ меняет другой администратор." : "Этим сотрудником управляет администратор выше уровнем."}</p> : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-drawer-title"
        className="fade-in h-full w-full max-w-[520px] overflow-y-auto border-l border-line bg-bg px-7 py-7 shadow-[-16px_0_40px_rgba(26,26,26,0.12)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="team-drawer-title" className="truncate text-[26px] tracking-[-0.03em] text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon shrink-0">
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function StatusLine({ member }: { member: TeamMember }) {
  const blocked = member.status === "BLOCKED";
  return (
    <span className={`inline-flex items-center gap-2 text-[14px] ${blocked ? "text-danger" : "text-success"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${blocked ? "bg-danger" : "bg-success"}`} aria-hidden />
      {blocked ? "Заблокирован" : "Активен"}
    </span>
  );
}

export function TeamPanel({ board }: { board: TeamBoard }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const blocked = board.members.filter((member) => member.status === "BLOCKED").length;
  const close = useCallback(() => setDraft(null), []);

  function done(message: string) {
    setDraft(null);
    setNotice(message);
    router.refresh();
  }

  return (
    <div className="fade-in mx-auto max-w-[1180px]">
      <header className="flex flex-wrap items-end justify-between gap-6 pt-4">
        <div>
          <p className="kicker text-muted">Управление</p>
          <h1 className="mt-3 text-[44px] leading-[1.02] tracking-[-0.045em] text-ink">Команда</h1>
          <p className="mt-3 text-[15px] text-muted">
            {board.members.length} в команде{blocked > 0 ? ` · ${blocked} заблокировано` : ""}
          </p>
        </div>
        {board.can.create && board.roles.length > 0 ? (
          <button type="button" onClick={() => setDraft({ mode: "new" })} className="btn btn-primary">
            Добавить сотрудника
          </button>
        ) : null}
      </header>

      {notice ? (
        <p role="status" className="mt-6 text-[15px] text-success">
          {notice}
        </p>
      ) : null}

      <section className="panel mt-8 overflow-hidden" aria-label="Сотрудники">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_24px] gap-4 border-b border-line/60 px-6 py-3 text-[12px] tracking-[0.08em] text-muted uppercase lg:grid">
          <span>Сотрудник</span>
          <span>Контакты</span>
          <span>Роль</span>
          <span>Объект</span>
          <span>Статус</span>
          <span>Последний вход</span>
          <span />
        </div>
        <ul>
          {board.members.map((member) => (
            <li key={member.membershipId} className="border-t border-line/50 first:border-t-0">
              <button
                type="button"
                onClick={() => setDraft({ mode: "edit", member })}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted/30 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_24px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="avatar h-10 w-10 shrink-0 text-[13px]" aria-hidden>
                    {initials(member.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] text-ink">
                      {member.name}
                      {member.self ? <span className="ml-2 text-[13px] text-muted">вы</span> : null}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {member.login}
                      <span className="lg:hidden">
                        {" · "}
                        {member.roleLabel} · {member.place}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="hidden min-w-0 text-[14px] text-muted lg:block">
                  <span className="block truncate">{member.email || "—"}</span>
                  <span className="block truncate">{member.phone || ""}</span>
                </span>
                <span className="hidden truncate text-[14px] text-ink lg:block">{member.roleLabel}</span>
                <span className="hidden truncate text-[14px] text-ink lg:block">{member.place}</span>
                <span className="hidden lg:block">
                  <StatusLine member={member} />
                </span>
                <span className="hidden truncate text-[14px] text-muted lg:block">{member.lastLogin}</span>
                <Icon name="chevron" className="h-4 w-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {draft?.mode === "new" ? (
        <Drawer title="Новый сотрудник" subtitle="Роль и объект задают, что человек увидит в консоли" onClose={close}>
          <NewMember board={board} onDone={() => done("Сотрудник добавлен.")} />
        </Drawer>
      ) : null}
      {draft?.mode === "edit" ? (
        <Drawer title={draft.member.name} subtitle={`${draft.member.roleLabel} · ${draft.member.place}`} onClose={close}>
          <div className="mb-8 flex items-center gap-6">
            <StatusLine member={draft.member} />
            <span className="text-[14px] text-muted">Вход: {draft.member.lastLogin}</span>
          </div>
          <EditMember key={draft.member.membershipId} board={board} member={draft.member} onDone={() => done("Изменения сохранены.")} />
        </Drawer>
      ) : null}
    </div>
  );
}
