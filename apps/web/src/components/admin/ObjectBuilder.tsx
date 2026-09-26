"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ViewToggle, useViewMode, type ViewMode } from "@/components/ui/ViewToggle";
import { plural } from "@/lib/format";
import { objectPresentation } from "@/lib/object-presentation";
import type { CatalogBuildingNode, CatalogTree, CatalogUnitNode } from "@/types/catalog";

type UnitPatch = {
  name: string;
  areaM2: number | null;
  floors: number;
  plans?: { floor: number; image: string }[];
};

export function ObjectBuilder({ tree }: { tree: CatalogTree }) {
  const router = useRouter();
  const presentation = objectPresentation[tree.object.type];
  const [name, setName] = useState(tree.object.name);
  const [address, setAddress] = useState(tree.object.address);
  const [securityPhone, setSecurityPhone] = useState(tree.object.securityPhone ?? "");
  const [unitName, setUnitName] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(tree.buildings?.[0]?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useViewMode("houses");
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
    await send(`/api/catalog/objects/${tree.object.id}`, "PATCH", { name, address, securityPhone });
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

  async function saveUnit(unitId: string, patch: UnitPatch) {
    return send(`/api/catalog/units/${unitId}`, "PATCH", patch);
  }

  async function saveBuilding(buildingId: string, name: string) {
    return send(`/api/catalog/buildings/${buildingId}`, "PATCH", { name });
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
          <label className="mt-4 block">
            <span className="text-sm text-muted">Телефон охраны</span>
            <input
              value={securityPhone}
              onChange={(event) => setSecurityPhone(event.target.value)}
              className="control mt-2"
              type="tel"
              inputMode="tel"
              placeholder="+7…"
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
        <div className="mt-3">
          <ViewToggle value={view} onChange={setView} />
        </div>
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
              view={view}
              editable={tree.can.structure}
              pendingDelete={pendingDelete}
              onAsk={setPendingDelete}
              onSave={saveUnit}
              onBlocked={() => setError("Эта единица уже закреплена за человеком.")}
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
                view={view}
                pendingDelete={pendingDelete}
                onAsk={setPendingDelete}
                onSaveUnit={saveUnit}
                onSaveBuilding={saveBuilding}
                onBlockedUnit={() => setError("Эта единица уже закреплена за человеком.")}
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

function unitMeta(unit: CatalogUnitNode): string {
  const parts = [
    unit.areaM2 != null ? `${String(unit.areaM2).replace(".", ",")} м²` : null,
    plural(unit.floors ?? 1, ["этаж", "этажа", "этажей"]),
    unit.planFloors.length
      ? `планировки ${unit.planFloors.length} из ${unit.floors ?? 1}`
      : "без планировки",
    unit.roomCount ? plural(unit.roomCount, ["помещение", "помещения", "помещений"]) : "без помещений",
  ].filter(Boolean);
  return parts.join(" · ");
}

function UnitList({
  units,
  view,
  editable,
  pendingDelete,
  onAsk,
  onSave,
  onBlocked,
  onRemove,
}: {
  units: CatalogUnitNode[];
  view: ViewMode;
  editable: boolean;
  pendingDelete: string | null;
  onAsk: (id: string | null) => void;
  onSave: (id: string, patch: UnitPatch) => Promise<boolean>;
  onBlocked: () => void;
  onRemove: (id: string) => void;
}) {
  if (units.length === 0) return <p className="mt-4 text-sm text-muted">Пока пусто.</p>;
  if (view === "blocks") {
    return (
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {units.map((unit) => (
          <UnitRow
            key={unit.id}
            unit={unit}
            view={view}
            editable={editable}
            pendingDelete={pendingDelete}
            onAsk={onAsk}
            onSave={onSave}
            onBlocked={onBlocked}
            onRemove={onRemove}
          />
        ))}
      </ul>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-line panel">
      {units.map((unit) => (
        <UnitRow
          key={unit.id}
          unit={unit}
          view={view}
          editable={editable}
          pendingDelete={pendingDelete}
          onAsk={onAsk}
          onSave={onSave}
          onBlocked={onBlocked}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

function UnitRow({
  unit,
  view,
  editable,
  pendingDelete,
  onAsk,
  onSave,
  onBlocked,
  onRemove,
}: {
  unit: CatalogUnitNode;
  view: ViewMode;
  editable: boolean;
  pendingDelete: string | null;
  onAsk: (id: string | null) => void;
  onSave: (id: string, patch: UnitPatch) => Promise<boolean>;
  onBlocked: () => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  const actions = editable ? (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button type="button" className="btn btn-secondary btn-compact" onClick={() => setEditing(true)}>
        Изменить
      </button>
      <button
        type="button"
        onClick={() => {
          if (!unit.canDelete) {
            onBlocked();
            return;
          }
          if (pendingDelete === unit.id) onRemove(unit.id);
          else onAsk(unit.id);
        }}
        className={`btn btn-compact ${pendingDelete === unit.id ? "btn-danger" : "btn-secondary"}`}
      >
        {pendingDelete === unit.id ? "Подтвердить" : "Удалить"}
      </button>
    </div>
  ) : null;

  if (editing) {
    return (
      <li className={view === "blocks" ? "panel p-5" : "px-5 py-3"}>
        <UnitEditor
          unit={unit}
          onSave={onSave}
          onClose={() => setEditing(false)}
        />
      </li>
    );
  }

  if (view === "blocks") {
    return (
      <li className="panel flex flex-col justify-between p-5">
        <div>
          <p className="text-[18px] tracking-[-0.03em] text-ink">{unit.name}</p>
          <p className="mt-2 text-sm text-muted">{unitMeta(unit)}</p>
        </div>
        {actions ? <div className="mt-4">{actions}</div> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-[15px] text-ink">{unit.name}</p>
        <p className="mt-1 truncate text-sm text-muted">{unitMeta(unit)}</p>
      </div>
      {actions}
    </li>
  );
}

function UnitEditor({
  unit,
  onSave,
  onClose,
}: {
  unit: CatalogUnitNode;
  onSave: (id: string, patch: UnitPatch) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(unit.name);
  const [area, setArea] = useState(unit.areaM2 == null ? "" : String(unit.areaM2));
  const [floors, setFloors] = useState(unit.floors ?? 1);
  const [plans, setPlans] = useState<{ floor: number; image: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; kind: string; floor: number | null }[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/catalog/units/${unit.id}`)
      .then((response) => response.json().catch(() => null))
      .then((payload: { plans?: { floor: number; image: string }[]; floors?: number; areaM2?: number | null; name?: string; rooms?: { id: string; name: string; kind: string; floor: number | null }[] } | null) => {
        if (!alive || !payload) return;
        setPlans(Array.isArray(payload.plans) ? payload.plans : []);
        setRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
        if (typeof payload.floors === "number") setFloors(payload.floors);
        if (payload.areaM2 != null) setArea(String(payload.areaM2));
        if (payload.name) setName(payload.name);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [unit.id]);

  async function readPlan(file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Планировка: JPEG, PNG или WebP");
    }
    if (file.size > 600_000) throw new Error("Планировка слишком большая");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }

  async function onPlan(floor: number, file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const image = await readPlan(file);
      setPlans((current) => [...current.filter((plan) => plan.floor !== floor), { floor, image }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось прочитать файл");
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const areaM2 = area.trim() ? Number(area.replace(",", ".")) : null;
    const saved = await onSave(unit.id, {
      name,
      areaM2: Number.isFinite(areaM2) ? areaM2 : null,
      floors,
      ...(loaded ? { plans: plans.filter((plan) => plan.floor <= floors) } : {}),
    });
    if (saved) onClose();
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <label className="block">
        <span className="text-sm text-muted">Название</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className="control mt-2" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-muted">Площадь, м²</span>
          <input value={area} onChange={(event) => setArea(event.target.value)} inputMode="decimal" className="control mt-2" />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Этажность</span>
          <select
            value={floors}
            onChange={(event) => setFloors(Number(event.target.value))}
            className="control mt-2"
          >
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      </div>
      {Array.from({ length: floors }, (_, index) => index + 1).map((floor) => {
        const plan = plans.find((item) => item.floor === floor);
        const label = floors === 1 ? "Планировка" : `${floor} этаж`;
        return (
          <label key={floor} className="block">
            <span className="text-sm text-muted">{label}</span>
            {plan?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={plan.image} alt={label} className="mt-2 max-h-40 rounded-2xl border border-line object-contain" />
            ) : (
              <p className="mt-2 text-sm text-muted">Картинка для будущей карты устройств.</p>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm text-muted"
              onChange={(event) => onPlan(floor, event.target.files?.[0])}
            />
          </label>
        );
      })}
      <div className="grid gap-3">
        <p className="text-sm text-muted">Помещения</p>
        {rooms.length ? (
          <ul className="grid gap-2">
            {rooms.map((room) => (
              <li key={room.id} className="flex items-center justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate text-ink">
                  {room.name}
                  {room.floor ? ` · ${room.floor} этаж` : ""}
                </span>
                <button
                  type="button"
                  className="text-sm text-muted"
                  onClick={async () => {
                    setError(null);
                    const response = await fetch(`/api/catalog/rooms/${room.id}`, { method: "DELETE" });
                    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
                    if (!response.ok) {
                      setError(payload?.message ?? "Не удалось удалить помещение");
                      return;
                    }
                    setRooms((current) => current.filter((item) => item.id !== room.id));
                  }}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Помещений пока нет.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <input
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="Гостиная"
            className="control"
          />
          {floors > 1 ? (
            <select value={roomFloor} onChange={(event) => setRoomFloor(event.target.value)} className="control">
              <option value="">Этаж</option>
              {Array.from({ length: floors }, (_, index) => index + 1).map((floor) => (
                <option key={floor} value={floor}>
                  {floor}
                </option>
              ))}
            </select>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={async () => {
              setError(null);
              const response = await fetch(`/api/catalog/units/${unit.id}/rooms`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: roomName, floor: roomFloor ? Number(roomFloor) : null }),
              });
              const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
              if (!response.ok) {
                setError(payload?.message ?? "Не удалось добавить помещение");
                return;
              }
              setRooms((current) => [...current, { id: payload?.id ?? roomName, name: roomName, kind: "OTHER", floor: roomFloor ? Number(roomFloor) : null }]);
              setRoomName("");
              setRoomFloor("");
            }}
          >
            Добавить
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary btn-compact">
          Сохранить
        </button>
        <button type="button" className="btn btn-secondary btn-compact" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
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
  view,
  pendingDelete,
  onAsk,
  onSaveUnit,
  onSaveBuilding,
  onBlockedUnit,
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
  view: ViewMode;
  pendingDelete: string | null;
  onAsk: (id: string | null) => void;
  onSaveUnit: (id: string, patch: UnitPatch) => Promise<boolean>;
  onSaveBuilding: (id: string, name: string) => Promise<boolean>;
  onBlockedUnit: () => void;
  onRemoveUnit: (id: string) => void;
  onRemoveBuilding: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(building.name);
  const blocked = building.units.some((unit) => !unit.canDelete);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSaveBuilding(building.id, name);
    if (saved) setEditing(false);
  }

  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={save} className="flex flex-wrap items-center gap-2">
              <input value={name} onChange={(event) => setName(event.target.value)} className="control min-w-0 flex-1" />
              <button type="submit" className="btn btn-primary btn-compact">
                Сохранить
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => {
                  setEditing(false);
                  setName(building.name);
                }}
              >
                Отмена
              </button>
            </form>
          ) : (
            <>
              <h3 className="text-[20px] tracking-[-0.03em] text-ink">{building.name}</h3>
              <p className="mt-1 text-sm text-muted">{countLabel}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {editable && !editing ? (
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => {
                setName(building.name);
                setEditing(true);
              }}
            >
              Изменить
            </button>
          ) : null}
          <button type="button" onClick={onToggle} className="btn btn-secondary btn-compact">
            {open ? "Скрыть" : "Показать"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-4">
          {editable ? <UnitForm label={`Добавить ${unitLabel}`} value={unitName} onChange={onUnitName} onSubmit={onAddUnit} /> : null}
          <UnitFilter count={building.units.length} query={query} onQuery={setQuery} />
          <UnitList
            units={visibleUnits(building.units, query)}
            view={view}
            editable={editable}
            pendingDelete={pendingDelete}
            onAsk={onAsk}
            onSave={onSaveUnit}
            onBlocked={onBlockedUnit}
            onRemove={onRemoveUnit}
          />
          {!query.trim() && building.units.length > 20 ? (
            <p className="mt-3 text-sm text-muted">Показаны первые 20. Введите номер, чтобы найти остальные.</p>
          ) : null}
        </div>
      ) : null}
      {removable ? (
        blocked ? (
          <p className="mt-4 text-sm text-muted">В корпусе есть занятые единицы.</p>
        ) : (
          <button
            type="button"
            onClick={() => (pendingDelete === building.id ? onRemoveBuilding() : onAsk(building.id))}
            className={`btn btn-compact mt-4 ${pendingDelete === building.id ? "btn-danger" : "btn-secondary"}`}
          >
            {pendingDelete === building.id ? "Подтвердить удаление" : `Удалить ${buildingLabel}`}
          </button>
        )
      ) : null}
    </section>
  );
}
