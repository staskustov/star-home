"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import type { ResidentObjectChoices, ResidentRow } from "@/server/residents";

export function ResidentsPanel({ people, objects }: { people: ResidentRow[]; objects: ResidentObjectChoices[] }) {
  const { selected } = useAdminPreview();
  const router = useRouter();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [unitId, setUnitId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = people
    .filter((person) => person.objectId === selected?.id)
    .slice()
    .sort((left, right) => compareUnits(left, right) || left.name.localeCompare(right.name, "ru"));
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
      body: JSON.stringify({ objectId: selected.id, unitId: selectedUnit, name, login, password }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string; existed?: boolean } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return;
    }
    setName("");
    setLogin("");
    setPassword("");
    setNotice(payload?.existed ? "Человек уже был в компании. Добавлено ещё одно место." : "Житель сохранён.");
    router.refresh();
  }

  async function remove(membershipId: string) {
    setError(null);
    const response = await fetch(`/api/residents/${membershipId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось убрать");
      return;
    }
    setPendingDelete(null);
    router.refresh();
  }

  if (!selected) {
    return <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Жители</h1>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Жители</h1>
      <p className="mt-3 text-[15px] text-muted">{selected.name}</p>

      <form onSubmit={add} className="mt-8 rounded-[20px] border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя" value={name} onChange={setName} />
          <Field label="Логин" value={login} onChange={setLogin} autoCapitalize="none" />
          <Field label="Пароль" value={password} onChange={setPassword} type="password" />
          <label className="block">
            <span className="text-sm text-muted">Единица</span>
            <select
              value={selectedUnit}
              onChange={(event) => setUnitId(event.target.value)}
              disabled={units.length === 0}
              className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-bg px-3 text-base text-ink outline-none focus:border-accent"
            >
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
            </select>
          </label>
        </div>
        {units.length === 0 ? <p className="mt-4 text-sm text-muted">Сначала добавьте единицы в структуре.</p> : null}
        <button
          type="submit"
          disabled={units.length === 0}
          className="mt-5 h-12 rounded-[14px] bg-accent px-5 text-[15px] text-accent-contrast disabled:opacity-40"
        >
          Добавить жителя
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}

      {rows.length === 0 ? (
        <p className="mt-8 text-[15px] text-muted">Жителей пока нет.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line rounded-[20px] border border-line bg-surface">
          {rows.map((person) => (
            <li key={person.membershipId} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-[17px] text-ink">{person.name}</p>
                <p className="mt-1 truncate text-sm text-muted">
                  {person.login} · {person.place}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  pendingDelete === person.membershipId ? remove(person.membershipId) : setPendingDelete(person.membershipId)
                }
                className="shrink-0 text-sm text-muted"
              >
                {pendingDelete === person.membershipId ? "Подтвердить" : "Убрать"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoCapitalize?: "none";
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        type={type}
        value={value}
        autoCapitalize={autoCapitalize}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
