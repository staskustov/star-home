"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { DeviceAddWizard } from "@/components/admin/DeviceAddWizard";
import { EditObjectButton } from "@/components/admin/ObjectManage";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/Select";
import { ViewToggle, useViewMode, type ViewMode } from "@/components/ui/ViewToggle";
import { plural } from "@/lib/format";
import { objectPresentation } from "@/lib/object-presentation";
import type { CatalogBuildingNode, CatalogTree, CatalogUnitNode } from "@/types/catalog";

const housePageSize = 16;

type UnitPatch = {
  name: string;
  areaM2: number | null;
  floors: number;
  plans?: { floor: number; image: string }[];
};

export function ObjectBuilder({ tree }: { tree: CatalogTree }) {
  const router = useRouter();
  const presentation = objectPresentation[tree.object.type];
  const [unitName, setUnitName] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(tree.buildings?.[0]?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useViewMode("houses");
  const desktop = useDesktopLayout();
  const houseView: ViewMode = desktop ? view : "blocks";
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

  async function addUnit(event: React.FormEvent<HTMLFormElement>, buildingId?: string) {
    event.preventDefault();
    const title = buildingId ? (unitNames[buildingId] ?? "") : unitName;
    const saved = await send(`/api/catalog/objects/${tree.object.id}/units`, "POST", {
      name: title,
      buildingId,
    });
    if (!saved) return false;
    if (buildingId) setUnitNames((current) => ({ ...current, [buildingId]: "" }));
    else {
      setUnitName("");
      setAddingUnit(false);
    }
    return true;
  }

  async function addBuilding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await send(`/api/catalog/objects/${tree.object.id}/buildings`, "POST", { name: buildingName });
    if (saved) {
      setBuildingName("");
      setAddingBuilding(false);
    }
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
    <div>
      <Link href="/admin/objects" className="text-sm text-muted">
        Объекты
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">{tree.object.name}</h1>
          <p className="mt-3 text-[15px] text-muted">
            {presentation.label}
            {tree.object.address ? ` · ${tree.object.address}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tree.can.edit ? (
            <EditObjectButton
              object={{
                id: tree.object.id,
                name: tree.object.name,
                address: tree.object.address,
                securityPhone: tree.object.securityPhone,
              }}
              iconOnly
            />
          ) : null}
          {tree.can.structure && tree.units ? (
            <button
              type="button"
              className="btn btn-primary btn-icon"
              aria-label={`Добавить ${unitLabel}`}
              onClick={() => setAddingUnit(true)}
            >
              <Icon name="plus" />
            </button>
          ) : null}
          {tree.can.buildings && tree.buildings ? (
            <button
              type="button"
              className="btn btn-primary btn-icon"
              aria-label={`Добавить ${buildingLabel}`}
              onClick={() => setAddingBuilding(true)}
            >
              <Icon name="plus" />
            </button>
          ) : null}
        </div>
      </div>

      {addingUnit ? (
        <NameDialog
          title={`Новый ${unitLabel}`}
          submitLabel={`Добавить ${unitLabel}`}
          value={unitName}
          onChange={setUnitName}
          onSubmit={(event) => addUnit(event)}
          onClose={() => {
            setAddingUnit(false);
            setUnitName("");
          }}
        />
      ) : null}
      {addingBuilding ? (
        <NameDialog
          title={`Новый ${buildingLabel}`}
          submitLabel={`Добавить ${buildingLabel}`}
          value={buildingName}
          onChange={setBuildingName}
          onSubmit={addBuilding}
          onClose={() => {
            setAddingBuilding(false);
            setBuildingName("");
          }}
        />
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[24px] tracking-[-0.03em] text-ink">{presentation.structureHint}</h2>
          {desktop ? <ViewToggle value={view} onChange={setView} /> : null}
        </div>
        {tree.units ? (
          <div className="mt-4">
            <UnitFilter count={tree.units.length} query={query} onQuery={setQuery} />
            <UnitList
              units={visibleUnits(tree.units, query)}
              objectId={tree.object.id}
              view={houseView}
              editable={tree.can.structure}
              pendingDelete={pendingDelete}
              onAsk={setPendingDelete}
              onSave={saveUnit}
              onBlocked={() => setError("Эта единица уже закреплена за человеком.")}
              onRemove={(id) => remove(`/api/catalog/units/${id}`)}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {tree.buildings?.map((building) => (
              <BuildingBlock
                key={building.id}
                objectId={tree.object.id}
                building={building}
                editable={tree.can.structure}
                removable={tree.can.buildings}
                unitLabel={unitLabel}
                open={openBuildingId === building.id}
                onToggle={() => setOpenBuildingId((current) => (current === building.id ? null : building.id))}
                unitName={unitNames[building.id] ?? ""}
                onUnitName={(value) => setUnitNames((current) => ({ ...current, [building.id]: value }))}
                onAddUnit={(event) => addUnit(event, building.id)}
                view={houseView}
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

function useDesktopLayout() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return desktop;
}

function visibleUnits(units: CatalogUnitNode[], query: string): CatalogUnitNode[] {
  const needle = query.trim().toLowerCase();
  return needle ? units.filter((unit) => unit.name.toLowerCase().includes(needle)) : units;
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
  return (
    <label className="mt-4 block">
      <span className="text-sm text-muted">Поиск{count ? ` среди ${count}` : ""}</span>
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className="control mt-2"
        placeholder="Название или номер"
      />
    </label>
  );
}

function NameDialog({
  title,
  submitLabel,
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        className="panel fade-in w-full max-w-md rounded-t-[28px] p-6 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="name-dialog-title" className="text-[24px] tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon">
            <Icon name="close" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6">
          <label className="block">
            <span className="text-sm text-muted">Название</span>
            <input value={value} onChange={(event) => onChange(event.target.value)} className="control mt-2" autoFocus />
          </label>
          <button type="submit" className="mt-6 btn btn-primary btn-block">
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
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
  objectId,
  view,
  editable,
  pendingDelete,
  onAsk,
  onSave,
  onBlocked,
  onRemove,
}: {
  units: CatalogUnitNode[];
  objectId: string;
  view: ViewMode;
  editable: boolean;
  pendingDelete: string | null;
  onAsk: (id: string | null) => void;
  onSave: (id: string, patch: UnitPatch) => Promise<boolean>;
  onBlocked: () => void;
  onRemove: (id: string) => void;
}) {
  const [limit, setLimit] = useState(housePageSize);
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    setLimit(housePageSize);
  }, [units]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || limit >= units.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(units.length, current + housePageSize));
        }
      },
      { rootMargin: "280px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, units.length]);

  if (units.length === 0) return <p className="mt-4 text-sm text-muted">Пока пусто.</p>;
  const shown = units.slice(0, limit);
  const rows = shown.map((unit) => (
    <UnitRow
      key={unit.id}
      objectId={objectId}
      unit={unit}
      view={view}
      editable={editable}
      pendingDelete={pendingDelete}
      onAsk={onAsk}
      onSave={onSave}
      onBlocked={onBlocked}
      onRemove={onRemove}
    />
  ));
  const more =
    limit < units.length ? (
      <li ref={sentinelRef} className="col-span-full px-1 py-3 text-sm text-muted">
        Ещё {units.length - limit}…
      </li>
    ) : null;
  if (view === "blocks") {
    return (
      <ul className="mt-4 grid grid-cols-1 gap-3 md:[grid-template-columns:repeat(auto-fill,minmax(10.75rem,1fr))]">
        {rows}
        {more}
      </ul>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-line panel">
      {rows}
      {more}
    </ul>
  );
}

function UnitRow({
  objectId,
  unit,
  view,
  editable,
  pendingDelete,
  onAsk,
  onSave,
  onBlocked,
  onRemove,
}: {
  objectId: string;
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

  const editor = editing ? (
    <UnitEditor objectId={objectId} unit={unit} onSave={onSave} onClose={() => setEditing(false)} />
  ) : null;

  if (view === "blocks") {
    return (
      <li className="panel flex flex-col justify-between p-4">
        <div className="min-w-0">
          <p className="truncate text-[16px] tracking-[-0.03em] text-ink">{unit.name}</p>
          <p className="mt-2 line-clamp-2 text-sm text-muted">{unitMeta(unit)}</p>
        </div>
        {actions ? <div className="mt-3">{actions}</div> : null}
        {editor}
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
      {editor}
    </li>
  );
}

function UnitEditor({
  objectId,
  unit,
  onSave,
  onClose,
}: {
  objectId: string;
  unit: CatalogUnitNode;
  onSave: (id: string, patch: UnitPatch) => Promise<boolean>;
  onClose: () => void;
}) {
  const { can } = useAdminPreview();
  const [name, setName] = useState(unit.name);
  const [area, setArea] = useState(unit.areaM2 == null ? "" : String(unit.areaM2));
  const [floors, setFloors] = useState(unit.floors ?? 1);
  const [plans, setPlans] = useState<{ floor: number; image: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; kind: string; floor: number | null; devices?: { id: string; name: string; kind: string }[] }[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [addingRoomId, setAddingRoomId] = useState<string | null>(null);
  const [gateways, setGateways] = useState<{ id: string; objectId: string; name: string; adapter: string; status: string }[]>([]);
  const [canCreateDevice, setCanCreateDevice] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/catalog/units/${unit.id}`)
      .then((response) => response.json().catch(() => null))
      .then((payload: {
        plans?: { floor: number; image: string }[];
        floors?: number;
        areaM2?: number | null;
        name?: string;
        rooms?: { id: string; name: string; kind: string; floor: number | null; devices?: { id: string; name: string; kind: string }[] }[];
        canCreateDevice?: boolean;
      } | null) => {
        if (!alive || !payload) return;
        setPlans(Array.isArray(payload.plans) ? payload.plans : []);
        setRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
        if (typeof payload.floors === "number") setFloors(payload.floors);
        if (payload.areaM2 != null) setArea(String(payload.areaM2));
        if (payload.name) setName(payload.name);
        setCanCreateDevice(payload.canCreateDevice === true);
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

  useEffect(() => {
    fetch(`/api/smart-home/gateways?objectId=${objectId}`)
      .then((response) => response.json().catch(() => null))
      .then((payload: { gateways?: { id: string; objectId: string; name: string; adapter: string; status: string }[] } | null) => {
        if (Array.isArray(payload?.gateways)) setGateways(payload.gateways);
      })
      .catch(() => undefined);
  }, [objectId]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-dialog-title"
        className="panel fade-in max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] p-6 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="unit-dialog-title" className="text-[24px] tracking-[-0.03em] text-ink">
            {unit.name}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon">
            <Icon name="close" />
          </button>
        </div>
    <form onSubmit={save} className="mt-6 grid gap-4">
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
          <Select value={floors} onChange={(event) => setFloors(Number(event.target.value))} wrapClassName="mt-2">
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
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
            <label className="file-btn btn btn-secondary btn-compact mt-3">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => onPlan(floor, event.target.files?.[0])}
              />
              {plan?.image ? "Заменить картинку" : "Добавить картинку"}
            </label>
          </label>
        );
      })}
      <div className="grid gap-3">
        <p className="text-sm text-muted">Помещения</p>
        {rooms.length ? (
          <ul className="grid gap-4">
            {rooms.map((room) => (
              <li key={room.id} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="min-w-0 truncate text-ink">
                    {room.name}
                    {room.floor ? ` · ${room.floor} этаж` : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
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
                </div>
                {(room.devices ?? []).length ? (
                  <ul className="grid gap-1 pl-1">
                    {(room.devices ?? []).map((device) => (
                      <li key={device.id}>
                        <Link href={`/admin/devices/${device.id}`} className="text-sm text-muted transition-colors hover:text-ink">
                          {device.name} · {device.kind}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Устройств нет.</p>
                )}
                {canCreateDevice || can("devices.create") ? (
                  <button type="button" className="btn btn-secondary btn-compact w-fit" onClick={() => setAddingRoomId(room.id)}>
                    Добавить устройство
                  </button>
                ) : null}
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
            <Select value={roomFloor} onChange={(event) => setRoomFloor(event.target.value)}>
              <option value="">Этаж</option>
              {Array.from({ length: floors }, (_, index) => index + 1).map((floor) => (
                <option key={floor} value={floor}>
                  {floor}
                </option>
              ))}
            </Select>
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
              setRooms((current) => [...current, { id: payload?.id ?? roomName, name: roomName, kind: "OTHER", floor: roomFloor ? Number(roomFloor) : null, devices: [] }]);
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
    {addingRoomId ? (
        <DeviceAddWizard
          objectId={objectId}
          gateways={gateways}
          rooms={rooms.map((room) => ({ id: room.id, objectId, unitId: unit.id, unitName: unit.name, name: room.name, kind: room.kind }))}
          units={[{ id: unit.id, objectId, name: unit.name }]}
          initialPlace="ROOM"
          initialUnitId={unit.id}
          initialRoomId={addingRoomId}
          lockScope="house"
          asDialog
          onClose={() => {
            setAddingRoomId(null);
            fetch(`/api/catalog/units/${unit.id}`)
              .then((response) => response.json().catch(() => null))
              .then((payload: { rooms?: { id: string; name: string; kind: string; floor: number | null; devices?: { id: string; name: string; kind: string }[] }[] } | null) => {
                if (Array.isArray(payload?.rooms)) setRooms(payload.rooms);
              })
              .catch(() => undefined);
          }}
        />
    ) : null}
      </div>
    </div>
  );
}

function BuildingBlock({
  objectId,
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
  objectId: string;
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
  onAddUnit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<boolean | void>;
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
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(building.name);
  const blocked = building.units.some((unit) => !unit.canDelete);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSaveBuilding(building.id, name);
    if (saved) setEditing(false);
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    const saved = await onAddUnit(event);
    if (saved !== false) setAdding(false);
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
              className="btn btn-secondary btn-icon"
              aria-label="Редактировать"
              onClick={() => {
                setName(building.name);
                setEditing(true);
              }}
            >
              <Icon name="edit" />
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="btn btn-primary btn-icon"
              aria-label={`Добавить ${unitLabel}`}
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" />
            </button>
          ) : null}
          <button type="button" onClick={onToggle} className="btn btn-secondary btn-compact">
            {open ? "Скрыть" : "Показать"}
          </button>
        </div>
      </div>
      {adding ? (
        <NameDialog
          title={`Новый ${unitLabel}`}
          submitLabel={`Добавить ${unitLabel}`}
          value={unitName}
          onChange={onUnitName}
          onSubmit={add}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {open ? (
        <div className="mt-4">
          <UnitFilter count={building.units.length} query={query} onQuery={setQuery} />
          <UnitList
            units={visibleUnits(building.units, query)}
            objectId={objectId}
            view={view}
            editable={editable}
            pendingDelete={pendingDelete}
            onAsk={onAsk}
            onSave={onSaveUnit}
            onBlocked={onBlockedUnit}
            onRemove={onRemoveUnit}
          />
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
