"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { plural } from "@/lib/format";
import { objectPresentation } from "@/lib/object-presentation";
import type { CatalogBuildingNode, CatalogTree, CatalogUnitNode } from "@/types/catalog";

export function ObjectBuilder({ tree }: { tree: CatalogTree }) {
  const router = useRouter();
  const presentation = objectPresentation[tree.object.type];
  const [name, setName] = useState(tree.object.name);
  const [address, setAddress] = useState(tree.object.address);
  const [unitName, setUnitName] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(tree.buildings?.[0]?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unitLabel = presentation.unitAction;
  const buildingLabel = presentation.buildingAction ?? "корпус";

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return false;
    }
    setPendingDelete(null);
    router.refresh();
    return true;
  }

  async function saveObject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(`/api/catalog/objects/${tree.object.id}`, "PATCH", { name, address });
  }

  async function addUnit(event: React.FormEvent<HTMLFormElement>, buildingId?: string) {
    event.preventDefault();
    const title = buildingId ? (unitNames[buildingId] ?? "") : unitName;
    const saved = await send(`/api/catalog/objects/${tree.object.id}/units`, "POST", {
      name: title,
      buildingId,
    });
    if (!saved) return;
    if (buildingId) setUnitNames((current) => ({ ...current, [buildingId]: "" }));
    else setUnitName("");
  }

  async function addBuilding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await send(`/api/catalog/objects/${tree.object.id}/buildings`, "POST", { name: buildingName });
    if (saved) setBuildingName("");
  }

  async function remove(url: string) {
    const saved = await send(url, "DELETE");
    if (saved && url.startsWith("/api/catalog/objects/")) router.push("/admin/objects");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/objects" className="text-sm text-muted">
        Объекты
      </Link>
      <h1 className="mt-3 text-[36px] leading-none tracking-[-0.04em] text-ink">{tree.object.name}</h1>
      <p className="mt-3 text-[15px] text-muted">{presentation.label}</p>

      {tree.can.edit ? (
        <form onSubmit={saveObject} className="mt-8 panel p-5">
          <label className="block">
            <span className="text-sm text-muted">Название</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="control mt-2"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-sm text-muted">Адрес</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="control mt-2"
            />
          </label>
          <button type="submit" className="mt-5 btn btn-primary">
            Сохранить
          </button>
        </form>
      ) : tree.object.address ? (
        <p className="mt-2 text-[15px] text-muted">{tree.object.address}</p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[24px] tracking-[-0.03em] text-ink">{presentation.structureHint}</h2>
        {tree.units ? (
          <div className="mt-4">
            {tree.can.structure ? (
              <UnitForm
                label={`Добавить ${unitLabel}`}
                value={unitName}
                onChange={setUnitName}
                onSubmit={(event) => addUnit(event)}
              />
            ) : null}
            <UnitFilter count={tree.units.length} query={query} onQuery={setQuery} />
            <UnitList
              units={visibleUnits(tree.units, query)}
              editable={tree.can.structure}
              pendingDelete={pendingDelete}
              onAsk={setPendingDelete}
              onRemove={(id) => remove(`/api/catalog/units/${id}`)}
            />
            {!query.trim() && tree.units.length > 20 ? (
              <p className="mt-3 text-sm text-muted">Показаны первые 20. Введите номер, чтобы найти остальные.</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {tree.buildings?.map((building) => (
              <BuildingBlock
                key={building.id}
                building={building}
                editable={tree.can.structure}
                removable={tree.can.buildings}
                unitLabel={unitLabel}
                open={openBuildingId === building.id}
                onToggle={() => setOpenBuildingId((current) => (current === building.id ? null : building.id))}
                unitName={unitNames[building.id] ?? ""}
                onUnitName={(value) => setUnitNames((current) => ({ ...current, [building.id]: value }))}
                onAddUnit={(event) => addUnit(event, building.id)}
                pendingDelete={pendingDelete}
                onAsk={setPendingDelete}
                onRemoveUnit={(id) => remove(`/api/catalog/units/${id}`)}
                onRemoveBuilding={() => remove(`/api/catalog/buildings/${building.id}`)}
                countLabel={plural(building.units.length, presentation.unitForms)}
                buildingLabel={buildingLabel}
              />
            ))}
            {tree.can.buildings ? (
              <form onSubmit={addBuilding} className="panel p-5">
                <label className="block">
                  <span className="text-sm text-muted">Название</span>
                  <input
                    value={buildingName}
                    onChange={(event) => setBuildingName(event.target.value)}
                    className="control mt-2"
                  />
                </label>
                <button type="submit" className="mt-4 btn btn-primary">
                  Добавить {buildingLabel}
                </button>
              </form>
            ) : null}
          </div>
        )}
      </section>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {tree.can.remove ? (
      <div className="mt-10">
        {tree.object.canDelete ? (
          <button
            type="button"
            onClick={() =>
              pendingDelete === tree.object.id
                ? remove(`/api/catalog/objects/${tree.object.id}`)
                : setPendingDelete(tree.object.id)
            }
            className="btn btn-danger"
          >
            {pendingDelete === tree.object.id ? "Подтвердить удаление" : "Удалить объект"}
          </button>
        ) : (
          <p className="text-sm text-muted">Объект с людьми удалить нельзя.</p>
        )}
      </div>
      ) : null}
    </div>
  );
}

function visibleUnits(units: CatalogUnitNode[], query: string): CatalogUnitNode[] {
  const needle = query.trim().toLowerCase();
  const matched = needle ? units.filter((unit) => unit.name.toLowerCase().includes(needle)) : units;
  if (needle || matched.length <= 20) return matched;
  return matched.slice(0, 20);
}

function UnitFilter({
  count,
  query,
  onQuery,
}: {
  count: number;
  query: string;
  onQuery: (value: string) => void;
}) {
  if (count <= 20) return null;
  return (
    <label className="mt-4 block">
      <span className="text-sm text-muted">Найти среди {count}</span>
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className="control mt-2"
      />
    </label>
  );
}

function UnitForm({
  label,
  value,
  onChange,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="panel p-5">
      <label className="block">
        <span className="text-sm text-muted">Название</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="control mt-2"
        />
      </label>
      <button type="submit" className="mt-4 btn btn-primary">
        {label}
      </button>
    </form>
  );
}

function UnitList({
  units,
  editable,
  pendingDelete,
  onAsk,
  onRemove,
}: {
  units: CatalogUnitNode[];
  editable: boolean;
  pendingDelete: string | null;
  onAsk: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  if (units.length === 0) return <p className="mt-4 text-sm text-muted">Пока пусто.</p>;
  return (
    <ul className="mt-4 divide-y divide-line panel">
      {units.map((unit) => (
        <li key={unit.id} className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="min-w-0 truncate text-[15px] text-ink">{unit.name}</span>
          {editable && unit.canDelete ? (
            <button
              type="button"
              onClick={() => (pendingDelete === unit.id ? onRemove(unit.id) : onAsk(unit.id))}
              className={`btn btn-compact shrink-0 ${pendingDelete === unit.id ? "btn-danger" : "btn-secondary"}`}
            >
              {pendingDelete === unit.id ? "Подтвердить" : "Удалить"}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function BuildingBlock({
  building,
  editable,
  removable,
  unitLabel,
  buildingLabel,
  countLabel,
  open,
  onToggle,
  unitName,
  onUnitName,
  onAddUnit,
  pendingDelete,
  onAsk,
  onRemoveUnit,
  onRemoveBuilding,
}: {
  building: CatalogBuildingNode;
  editable: boolean;
  removable: boolean;
  unitLabel: string;
  buildingLabel: string;
  countLabel: string;
  open: boolean;
  onToggle: () => void;
  unitName: string;
  onUnitName: (value: string) => void;
  onAddUnit: (event: React.FormEvent<HTMLFormElement>) => void;
  pendingDelete: string | null;
  onAsk: (id: string | null) => void;
  onRemoveUnit: (id: string) => void;
  onRemoveBuilding: () => void;
}) {
  const [query, setQuery] = useState("");
  const blocked = building.units.some((unit) => !unit.canDelete);
  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[20px] tracking-[-0.03em] text-ink">{building.name}</h3>
          <p className="mt-1 text-sm text-muted">{countLabel}</p>
        </div>
        <button type="button" onClick={onToggle} className="btn btn-secondary btn-compact shrink-0">
          {open ? "Скрыть" : "Показать"}
        </button>
      </div>
      {open ? (
        <div className="mt-4">
          {editable ? <UnitForm label={`Добавить ${unitLabel}`} value={unitName} onChange={onUnitName} onSubmit={onAddUnit} /> : null}
          <UnitFilter count={building.units.length} query={query} onQuery={setQuery} />
          <UnitList
            units={visibleUnits(building.units, query)}
            editable={editable}
            pendingDelete={pendingDelete}
            onAsk={onAsk}
            onRemove={onRemoveUnit}
          />
          {!query.trim() && building.units.length > 20 ? (
            <p className="mt-3 text-sm text-muted">Показаны первые 20. Введите номер, чтобы найти остальные.</p>
          ) : null}
        </div>
      ) : null}
      {removable && !blocked ? (
        <button
          type="button"
          onClick={() => (pendingDelete === building.id ? onRemoveBuilding() : onAsk(building.id))}
          className={`btn btn-compact mt-4 ${pendingDelete === building.id ? "btn-danger" : "btn-secondary"}`}
        >
          {pendingDelete === building.id ? "Подтвердить удаление" : `Удалить ${buildingLabel}`}
        </button>
      ) : null}
    </section>
  );
}
