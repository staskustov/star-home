import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { boundValue, remember } from "@/server/store-bind";
import { objectPresentation, unitTypeFor } from "@/lib/object-presentation";
import type { ObjectType, Role, Unit } from "@/types/domain";

export type CatalogCompany = {
  id: string;
  name: string;
  roles?: Partial<Record<Role, string[]>>;
};

export type CatalogObject = {
  id: string;
  companyId: string;
  name: string;
  type: ObjectType;
  address: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogBuilding = {
  id: string;
  objectId: string;
  name: string;
  number: string;
  floors: number | null;
};

export type FloorPlan = {
  floor: number;
  image: string;
};

export type CatalogUnit = {
  id: string;
  objectId: string;
  buildingId: string | null;
  name: string;
  number: string;
  type: Unit["type"];
  areaM2: number | null;
  floors: number;
  plans: FloorPlan[];
};

type Catalog = {
  companies: CatalogCompany[];
  objects: CatalogObject[];
  buildings: CatalogBuilding[];
  units: CatalogUnit[];
};

const filePath = path.join(process.cwd(), "data", "catalog.json");

const globalStore = globalThis as typeof globalThis & { __starHomeCatalog?: Catalog };

function now(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function house(number: number): CatalogUnit {
  return {
    id: number === 24 ? "unit_24" : `unit_siyanie_${number}`,
    objectId: "obj_siyanie",
    buildingId: null,
    name: `Дом №${number}`,
    number: String(number),
    type: "HOUSE",
    areaM2: null,
    floors: 1,
    plans: [],
  };
}

function apartment(objectId: string, buildingId: string, number: number, kind: "APARTMENT" | "APARTMENT_UNIT"): CatalogUnit {
  const special = objectId === "obj_park" && number === 84;
  const title = kind === "APARTMENT" ? "Квартира" : "Апартамент";
  return {
    id: special ? "unit_84" : `unit_${objectId}_${number}`,
    objectId,
    buildingId,
    name: `${title} №${number}`,
    number: String(number),
    type: kind,
    areaM2: null,
    floors: 1,
    plans: [],
  };
}

function seed(): Catalog {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const buildings: CatalogBuilding[] = [
    { id: "bld_park_1", objectId: "obj_park", name: "Корпус 1", number: "1", floors: null },
    { id: "bld_2", objectId: "obj_park", name: "Корпус 2", number: "2", floors: null },
    { id: "bld_park_3", objectId: "obj_park", name: "Корпус 3", number: "3", floors: null },
    { id: "bld_sky_a", objectId: "obj_sky", name: "Корпус A", number: "A", floors: null },
    { id: "bld_sky_b", objectId: "obj_sky", name: "Корпус B", number: "B", floors: null },
  ];
  const units: CatalogUnit[] = [];
  for (let number = 1; number <= 55; number += 1) units.push(house(number));
  for (let number = 1; number <= 248; number += 1) {
    const buildingId = number <= 82 ? "bld_park_1" : number <= 165 ? "bld_2" : "bld_park_3";
    units.push(apartment("obj_park", buildingId, number, "APARTMENT"));
  }
  for (let number = 1; number <= 96; number += 1) {
    units.push(apartment("obj_sky", number <= 48 ? "bld_sky_a" : "bld_sky_b", number, "APARTMENT_UNIT"));
  }
  buildings.push({ id: "bld_new_1", objectId: "obj_new", name: "Корпус 1", number: "1", floors: null });
  units.push(
    { id: "unit_new_1", objectId: "obj_new", buildingId: "bld_new_1", name: "Квартира №1", number: "1", type: "APARTMENT", areaM2: null, floors: 1, plans: [] },
    { id: "unit_new_2", objectId: "obj_new", buildingId: "bld_new_1", name: "Квартира №2", number: "2", type: "APARTMENT", areaM2: null, floors: 1, plans: [] },
    { id: "unit_new_house_1", objectId: "obj_new_cottage", buildingId: null, name: "Дом №1", number: "1", type: "HOUSE", areaM2: null, floors: 1, plans: [] },
    { id: "unit_new_house_2", objectId: "obj_new_cottage", buildingId: null, name: "Дом №2", number: "2", type: "HOUSE", areaM2: null, floors: 1, plans: [] },
  );
  return {
    companies: [{ id: "cmp_star", name: "Star" }],
    objects: [
      {
        id: "obj_siyanie",
        companyId: "cmp_star",
        name: "КП Сияние",
        type: "COTTAGE_COMMUNITY",
        address: "Московская область",
        description: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "obj_park",
        companyId: "cmp_star",
        name: "ЖК Парк Лайт",
        type: "RESIDENTIAL_COMPLEX",
        address: "Москва",
        description: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "obj_sky",
        companyId: "cmp_star",
        name: "Sky Residence",
        type: "APARTMENT_COMPLEX",
        address: "Москва",
        description: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "obj_new",
        companyId: "cmp_star",
        name: "ЖК Новый",
        type: "RESIDENTIAL_COMPLEX",
        address: "",
        description: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "obj_new_cottage",
        companyId: "cmp_star",
        name: "КП Новый",
        type: "COTTAGE_COMMUNITY",
        address: "",
        description: "",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    buildings,
    units,
  };
}

function withScale(catalog: Catalog): Catalog {
  const extra = seed();
  const kept = new Set(catalog.objects.map((object) => object.id));
  let changed = false;
  for (const building of extra.buildings) {
    if (!kept.has(building.objectId) || catalog.buildings.some((item) => item.id === building.id)) continue;
    catalog.buildings.push(building);
    changed = true;
  }
  for (const unit of extra.units) {
    if (!kept.has(unit.objectId) || catalog.units.some((item) => item.id === unit.id)) continue;
    catalog.units.push(unit);
    changed = true;
  }
  if (changed) persist(catalog);
  return normalizeUnits(catalog);
}

function normalizeUnits(catalog: Catalog): Catalog {
  for (const unit of catalog.units) {
    unit.areaM2 ??= null;
    unit.floors ??= 1;
    unit.plans ??= [];
  }
  return catalog;
}

function load(): Catalog {
  if (globalStore.__starHomeCatalog) return globalStore.__starHomeCatalog;
  const bound = boundValue("catalog");
  if (bound) {
    globalStore.__starHomeCatalog = withScale(bound as Catalog);
    return globalStore.__starHomeCatalog;
  }
  if (existsSync(filePath)) {
    globalStore.__starHomeCatalog = withScale(JSON.parse(readFileSync(filePath, "utf8")) as Catalog);
    return globalStore.__starHomeCatalog;
  }
  const catalog = seed();
  persist(catalog);
  return catalog;
}

function persist(catalog: Catalog): void {
  globalStore.__starHomeCatalog = catalog;
  if (remember("catalog", catalog)) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(catalog));
}

export function findCompany(companyId: string): CatalogCompany | undefined {
  return load().companies.find((company) => company.id === companyId);
}

export function companyGrants(companyId: string, role: Role): string[] | null {
  return findCompany(companyId)?.roles?.[role] ?? null;
}

export function setCompanyGrants(companyId: string, role: Role, granted: string[] | null): void {
  const catalog = load();
  const company = catalog.companies.find((item) => item.id === companyId);
  if (!company) return;
  const roles = { ...company.roles };
  if (granted) roles[role] = granted;
  else delete roles[role];
  company.roles = roles;
  persist(catalog);
}

export function findObject(objectId: string): CatalogObject | undefined {
  return load().objects.find((object) => object.id === objectId);
}

export function findBuilding(buildingId: string): CatalogBuilding | undefined {
  return load().buildings.find((building) => building.id === buildingId);
}

export function buildingsOf(objectId: string): CatalogBuilding[] {
  return load().buildings.filter((building) => building.objectId === objectId);
}

export function findUnit(unitId: string): CatalogUnit | undefined {
  return load().units.find((unit) => unit.id === unitId);
}

export function objectsOf(companyId: string, onlyObjectId: string | null): CatalogObject[] {
  return load().objects.filter(
    (object) => object.companyId === companyId && (onlyObjectId === null || object.id === onlyObjectId),
  );
}

export function structureCounts(objectId: string, type: ObjectType): { buildings: number | null; units: number } {
  const catalog = load();
  const units = catalog.units.filter((unit) => unit.objectId === objectId).length;
  if (!objectPresentation[type].usesBuildings) return { buildings: null, units };
  const buildings = catalog.buildings.filter((building) => building.objectId === objectId).length;
  return { buildings, units };
}

export function unitIdsOf(objectId: string): string[] {
  return load()
    .units.filter((unit) => unit.objectId === objectId)
    .map((unit) => unit.id);
}

export function unitIdsOfBuilding(buildingId: string): string[] {
  return load()
    .units.filter((unit) => unit.buildingId === buildingId)
    .map((unit) => unit.id);
}

export function createCatalogObject(input: {
  companyId: string;
  name: string;
  type: ObjectType;
  address: string;
}): CatalogObject {
  const catalog = load();
  const stamp = now();
  const object: CatalogObject = {
    id: newId("obj"),
    companyId: input.companyId,
    name: input.name,
    type: input.type,
    address: input.address,
    description: "",
    createdAt: stamp,
    updatedAt: stamp,
  };
  catalog.objects.unshift(object);
  persist(catalog);
  return object;
}

export function updateCatalogObject(objectId: string, input: { name: string; address: string }): CatalogObject | undefined {
  const catalog = load();
  const object = catalog.objects.find((item) => item.id === objectId);
  if (!object) return undefined;
  object.name = input.name;
  object.address = input.address;
  object.updatedAt = now();
  persist(catalog);
  return object;
}

export function deleteCatalogObject(objectId: string): void {
  const catalog = load();
  catalog.objects = catalog.objects.filter((object) => object.id !== objectId);
  catalog.buildings = catalog.buildings.filter((building) => building.objectId !== objectId);
  catalog.units = catalog.units.filter((unit) => unit.objectId !== objectId);
  persist(catalog);
}

export function createCatalogBuilding(objectId: string, name: string): CatalogBuilding {
  const catalog = load();
  const building: CatalogBuilding = {
    id: newId("bld"),
    objectId,
    name,
    number: "",
    floors: null,
  };
  catalog.buildings.push(building);
  persist(catalog);
  return building;
}

export function updateCatalogBuilding(buildingId: string, name: string): CatalogBuilding | undefined {
  const catalog = load();
  const building = catalog.buildings.find((item) => item.id === buildingId);
  if (!building) return undefined;
  building.name = name;
  persist(catalog);
  return building;
}

export function deleteCatalogBuilding(buildingId: string): void {
  const catalog = load();
  catalog.buildings = catalog.buildings.filter((building) => building.id !== buildingId);
  catalog.units = catalog.units.filter((unit) => unit.buildingId !== buildingId);
  persist(catalog);
}

export function createCatalogUnit(input: {
  objectId: string;
  buildingId: string | null;
  name: string;
  type: ObjectType;
}): CatalogUnit {
  const catalog = load();
  const unit: CatalogUnit = {
    id: newId("unit"),
    objectId: input.objectId,
    buildingId: input.buildingId,
    name: input.name,
    number: "",
    type: unitTypeFor(input.type),
    areaM2: null,
    floors: 1,
    plans: [],
  };
  catalog.units.push(unit);
  persist(catalog);
  return unit;
}

export function updateCatalogUnit(
  unitId: string,
  patch: { name?: string; areaM2?: number | null; floors?: number; plans?: FloorPlan[] },
): CatalogUnit | undefined {
  const catalog = load();
  const unit = catalog.units.find((item) => item.id === unitId);
  if (!unit) return undefined;
  if (typeof patch.name === "string") {
    unit.name = patch.name;
    const digits = patch.name.match(/(\d+)\s*$/);
    if (digits) unit.number = digits[1];
  }
  if (patch.areaM2 !== undefined) unit.areaM2 = patch.areaM2;
  if (typeof patch.floors === "number") unit.floors = patch.floors;
  if (patch.plans) unit.plans = patch.plans.filter((plan) => plan.floor >= 1 && plan.floor <= (unit.floors ?? 1));
  persist(catalog);
  return unit;
}

export function deleteCatalogUnit(unitId: string): void {
  const catalog = load();
  catalog.units = catalog.units.filter((unit) => unit.id !== unitId);
  persist(catalog);
}

export function readTree(objectId: string): {
  object: CatalogObject;
  buildings: (CatalogBuilding & { units: CatalogUnit[] })[] | null;
  units: CatalogUnit[] | null;
} | null {
  const catalog = load();
  const object = catalog.objects.find((item) => item.id === objectId);
  if (!object) return null;
  const usesBuildings = objectPresentation[object.type].usesBuildings;
  if (!usesBuildings) {
    return {
      object,
      buildings: null,
      units: catalog.units.filter((unit) => unit.objectId === objectId),
    };
  }
  const buildings = catalog.buildings
    .filter((building) => building.objectId === objectId)
    .map((building) => ({
      ...building,
      units: catalog.units.filter((unit) => unit.buildingId === building.id),
    }));
  return { object, buildings, units: null };
}
