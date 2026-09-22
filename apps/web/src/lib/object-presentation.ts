import type { ObjectType } from "@/types/domain";
import { plural } from "@/lib/format";

type Forms = readonly [string, string, string];

export type ObjectPresentation = {
  label: string;
  usesBuildings: boolean;
  unitForms: Forms;
  buildingForms: Forms | null;
  structureHint: string;
};

export const objectPresentation: Record<ObjectType, ObjectPresentation> = {
  COTTAGE_COMMUNITY: {
    label: "Коттеджный посёлок",
    usesBuildings: false,
    unitForms: ["дом", "дома", "домов"],
    buildingForms: null,
    structureHint: "Дома",
  },
  RESIDENTIAL_COMPLEX: {
    label: "Жилой комплекс",
    usesBuildings: true,
    unitForms: ["квартира", "квартиры", "квартир"],
    buildingForms: ["корпус", "корпуса", "корпусов"],
    structureHint: "Корпуса и квартиры",
  },
  APARTMENT_COMPLEX: {
    label: "Апарт-комплекс",
    usesBuildings: true,
    unitForms: ["апартамент", "апартамента", "апартаментов"],
    buildingForms: ["корпус", "корпуса", "корпусов"],
    structureHint: "Корпуса и апартаменты",
  },
  APARTMENT_BUILDING: {
    label: "Многоквартирный дом",
    usesBuildings: false,
    unitForms: ["квартира", "квартиры", "квартир"],
    buildingForms: null,
    structureHint: "Квартиры",
  },
  MULTI_FAMILY_BUILDING: {
    label: "Дом на несколько семей",
    usesBuildings: false,
    unitForms: ["помещение", "помещения", "помещений"],
    buildingForms: null,
    structureHint: "Помещения",
  },
  CUSTOM: {
    label: "Объект",
    usesBuildings: true,
    unitForms: ["единица", "единицы", "единиц"],
    buildingForms: ["здание", "здания", "зданий"],
    structureHint: "Здания и единицы",
  },
};

export function structureLine(type: ObjectType, buildings: number | null, units: number): string {
  const presentation = objectPresentation[type];
  const unitsLine = plural(units, presentation.unitForms);
  if (presentation.usesBuildings && presentation.buildingForms && buildings !== null) {
    return `${plural(buildings, presentation.buildingForms)} · ${unitsLine}`;
  }
  return unitsLine;
}
