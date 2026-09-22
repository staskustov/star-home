"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { objectPresentation } from "@/lib/object-presentation";
import type { AdminObjectSnapshot, ObjectType } from "@/types/domain";

type AdminPreviewValue = {
  companyName: string;
  actorLabel: string;
  objects: AdminObjectSnapshot[];
  selectedId: string;
  selected: AdminObjectSnapshot;
  select: (id: string) => void;
  addObject: (input: { name: string; type: ObjectType }) => void;
};

const AdminPreviewContext = createContext<AdminPreviewValue | null>(null);

export function AdminPreviewProvider({
  companyName,
  actorLabel,
  initialObjects,
  children,
}: {
  companyName: string;
  actorLabel: string;
  initialObjects: AdminObjectSnapshot[];
  children: React.ReactNode;
}) {
  const [objects, setObjects] = useState(initialObjects);
  const [selectedId, setSelectedId] = useState(initialObjects[0]?.id ?? "");

  const value = useMemo<AdminPreviewValue | null>(() => {
    const selected = objects.find((object) => object.id === selectedId) ?? objects[0];
    if (!selected) return null;
    return {
      companyName,
      actorLabel,
      objects,
      selectedId: selected.id,
      selected,
      select: setSelectedId,
      addObject: (input) => {
        const presentation = objectPresentation[input.type];
        const created: AdminObjectSnapshot = {
          id: `obj_${Date.now()}`,
          companyId: selected.companyId,
          name: input.name.trim(),
          type: input.type,
          buildings: presentation.usesBuildings ? 0 : null,
          units: 0,
          residents: 0,
          visitors: 0,
          requests: 0,
          alarms: 0,
          accessEvents: [],
          systems: [],
        };
        setObjects((current) => [created, ...current]);
        setSelectedId(created.id);
      },
    };
  }, [actorLabel, companyName, objects, selectedId]);

  if (!value) return null;

  return <AdminPreviewContext.Provider value={value}>{children}</AdminPreviewContext.Provider>;
}

export function useAdminPreview() {
  const value = useContext(AdminPreviewContext);
  if (!value) {
    throw new Error("Admin preview is unavailable");
  }
  return value;
}
