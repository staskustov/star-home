import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { objectPresentation, unitTypeFor } from "@/lib/object-presentation";
import type { ObjectType, Unit } from "@/types/domain";

export type CatalogCompany = {
  id: string;
  name: string;
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

export type CatalogUnit = {
  id: string;
  objectId: string;
  buildingId: string | null;
  name: string;
  number: string;
  type: Unit["type"];
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
    ],
    buildings,
    units,
  };
}

function load(): Catalog {
  if (globalStore.__starHomeCatalog) return globalStore.__starHomeCatalog;
  if (existsSync(filePath)) {
    globalStore.__starHomeCatalog = JSON.parse(readFileSync(filePath, "utf8")) as Catalog;
    return globalStore.__starHomeCatalog;
  }
  const catalog = seed();
  persist(catalog);
  return catalog;
}

function persist(catalog: Catalog): void {
  globalStore.__starHomeCatalog = catalog;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(catalog));
}

export function findCompany(companyId: string): CatalogCompany | undefined {
  return load().companies.find((company) => company.id === companyId);
}

export function findObject(objectId: string): CatalogObject | undefined {
  return load().objects.find((object) => object.id === objectId);
}

export function findBuilding(buildingId: string): CatalogBuilding | undefined {
  return load().buildings.find((building) => building.id === buildingId);
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
  };
  catalog.units.push(unit);
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
