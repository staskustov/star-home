"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { Select } from "@/components/ui/Select";
import { ViewToggle, useViewMode } from "@/components/ui/ViewToggle";
import type { ResidentGroup, ResidentObjectChoices, ResidentRow } from "@/server/residents";

type Rights = { create: boolean; edit: boolean; remove: boolean };

export function ResidentsPanel({
  people,
  objects,
  can,
}: {
  people: ResidentRow[];
  objects: ResidentObjectChoices[];
  can: Rights;
}) {
  const { selected } = useAdminPreview();
  const router = useRouter();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [login, setLogin] = useState("");
  const [view, setView] = useViewMode("residents");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("RESIDENT");
  const [expiresAt, setExpiresAt] = useState("");
  const [unitId, setUnitId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = people
    .filter((person) => person.objectId === selected?.id)
    .slice()
    .sort((left, right) => compareUnits(left, right) || left.displayName.localeCompare(right.displayName, "ru"));
  const groups = objects.find((object) => object.id === selected?.id)?.groups ?? [];
  const units = groups.flatMap((group) => group.units);
  const selectedUnit = units.some((unit) => unit.id === unitId) ? unitId : (units[0]?.id ?? "");

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!selected) return;
    const response = await fetch("/api/residents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: selected.id, unitId: selectedUnit, name, surname, login, password, role, expiresAt: role === "GUEST" ? expiresAt : undefined }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string; existed?: boolean } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return;
    }
    setName("");
    setSurname("");
    setLogin("");
    setPassword("");
    setNotice(payload?.existed ? "Человек уже был в компании. Добавлено ещё одно место." : "Житель сохранён.");
    router.refresh();
  }

  async function save(person: ResidentRow, draft: ResidentDraft) {
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/residents/${person.membershipId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        surname: draft.surname,
        login: draft.login,
        password: draft.password || undefined,
        role: draft.role,
        unitId: draft.unitId,
        expiresAt: draft.role === "GUEST" ? draft.expiresAt : undefined,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return false;
    }
    setEditingId(null);
    setNotice("Данные жителя сохранены.");
    router.refresh();
    return true;
  }

  async function remove(membershipId: string) {
    setError(null);
    const response = await fetch(`/api/residents/${membershipId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось удалить");
      return;
    }
    setPendingDelete(null);
    setEditingId(null);
    router.refresh();
  }

  if (!selected) {
    return <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Жители</h1>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Жители</h1>
      <p className="mt-3 text-[15px] text-muted">{selected.name}</p>
      <div className="mt-4">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {can.create ? (
        <form onSubmit={add} className="mt-8 panel p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя" value={name} onChange={setName} />
            <Field label="Фамилия" value={surname} onChange={setSurname} />
            <Field label="Логин" value={login} onChange={setLogin} autoCapitalize="none" />
            <Field label="Пароль" value={password} onChange={setPassword} type="password" />
            <RoleField value={role} onChange={setRole} />
            {role === "GUEST" ? <Field label="Срок пропуска" value={expiresAt} onChange={setExpiresAt} type="date" /> : null}
            <UnitField groups={groups} value={selectedUnit} onChange={setUnitId} disabled={units.length === 0} />
          </div>
          {units.length === 0 ? <p className="mt-4 text-sm text-muted">Сначала добавьте единицы в структуре.</p> : null}
          <button type="submit" disabled={units.length === 0} className="mt-5 btn btn-primary disabled:opacity-40">
            Добавить жителя
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}

      {rows.length === 0 ? (
        <p className="mt-8 text-[15px] text-muted">Жителей пока нет.</p>
      ) : (
        <ul className={view === "blocks" ? "mt-8 grid gap-3 sm:grid-cols-2" : "mt-8 divide-y divide-line panel"}>
          {rows.map((person) => (
            <ResidentRowItem
              key={`${person.membershipId}-${editingId === person.membershipId ? "edit" : "view"}`}
              person={person}
              view={view}
              groups={groups}
              can={can}
              editing={editingId === person.membershipId}
              pendingDelete={pendingDelete === person.membershipId}
              onEdit={() => {
                setPendingDelete(null);
                setEditingId(person.membershipId);
              }}
              onCancelEdit={() => setEditingId(null)}
              onAskDelete={() => {
                setEditingId(null);
                setPendingDelete(person.membershipId);
              }}
              onDelete={() => remove(person.membershipId)}
              onSave={(draft) => save(person, draft)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type ResidentDraft = {
  name: string;
  surname: string;
  login: string;
  password: string;
  role: string;
  unitId: string;
  expiresAt: string;
};

function ResidentRowItem({
  person,
  view,
  groups,
  can,
  editing,
  pendingDelete,
  onEdit,
  onCancelEdit,
  onAskDelete,
  onDelete,
  onSave,
}: {
  person: ResidentRow;
  view: "list" | "blocks";
  groups: ResidentGroup[];
  can: Rights;
  editing: boolean;
  pendingDelete: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onSave: (draft: ResidentDraft) => Promise<boolean>;
}) {
  const units = groups.flatMap((group) => group.units);
  const [name, setName] = useState(person.name);
  const [surname, setSurname] = useState(person.surname);
  const [login, setLogin] = useState(person.login);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(person.role);
  const [expiresAt, setExpiresAt] = useState(person.expiresAt);
  const [unitId, setUnitId] = useState(units.some((unit) => unit.id === person.unitId) ? person.unitId : (units[0]?.id ?? person.unitId));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({ name, surname, login, password, role, unitId, expiresAt });
  }

  if (editing) {
    return (
      <li className={view === "blocks" ? "panel p-5" : "px-5 py-4"}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя" value={name} onChange={setName} />
          <Field label="Фамилия" value={surname} onChange={setSurname} />
          <Field label="Логин" value={login} onChange={setLogin} autoCapitalize="none" />
          <Field label="Новый пароль" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <RoleField value={role} onChange={setRole} />
          {role === "GUEST" ? <Field label="Срок пропуска" value={expiresAt} onChange={setExpiresAt} type="date" /> : null}
          <UnitField groups={groups} value={unitId} onChange={setUnitId} disabled={units.length === 0} />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary btn-compact">
              Сохранить
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={onCancelEdit}>
              Отмена
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={view === "blocks" ? "panel flex flex-col justify-between p-5" : "flex items-center justify-between gap-3 px-5 py-4"}>
      <div className="min-w-0">
        <p className="truncate text-[17px] text-ink">{person.displayName}</p>
        <p className="mt-1 truncate text-sm text-muted">
          {person.login} · {person.roleLabel} · {person.place}
        </p>
      </div>
      {can.edit || can.remove ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {can.edit ? (
            <button type="button" onClick={onEdit} className="btn btn-secondary btn-compact">
              Изменить
            </button>
          ) : null}
          {can.remove ? (
            <button
              type="button"
              onClick={() => (pendingDelete ? onDelete() : onAskDelete())}
              className={`btn btn-compact ${pendingDelete ? "btn-danger" : "btn-secondary"}`}
            >
              {pendingDelete ? "Подтвердить" : "Удалить"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function compareUnits(left: ResidentRow, right: ResidentRow): number {
  const leftNumber = Number(left.unitNumber);
  const rightNumber = Number(right.unitNumber);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.unitName.localeCompare(right.unitName, "ru");
}

function RoleField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">Роль</span>
      <Select wrapClassName="mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="RESIDENT">Житель</option>
        <option value="FAMILY_MEMBER">Семья</option>
        <option value="GUEST">Гость</option>
      </Select>
    </label>
  );
}

function UnitField({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: ResidentGroup[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">Единица</span>
      <Select wrapClassName="mt-2" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {groups.map((group, index) =>
          group.label ? (
            <optgroup key={`${group.label}-${index}`} label={group.label}>
              {group.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </optgroup>
          ) : (
            group.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))
          ),
        )}
      </Select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoCapitalize,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoCapitalize?: "none";
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        type={type}
        value={value}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="control mt-2"
      />
    </label>
  );
}
