import type { ObjectType } from "@/types/domain";

export type CatalogRoomNode = {
  id: string;
  name: string;
  kind: string;
  floor: number | null;
};

export type CatalogUnitNode = {
  id: string;
  name: string;
  number: string;
  areaM2: number | null;
  floors: number;
  planFloors: number[];
  roomCount: number;
  canDelete: boolean;
};

export type CatalogBuildingNode = {
  id: string;
  name: string;
  number: string;
  units: CatalogUnitNode[];
};

export type CatalogTree = {
  object: {
    id: string;
    name: string;
    type: ObjectType;
    address: string;
    canDelete: boolean;
  };
  buildings: CatalogBuildingNode[] | null;
  units: CatalogUnitNode[] | null;
  can: { edit: boolean; structure: boolean; buildings: boolean; remove: boolean };
};
