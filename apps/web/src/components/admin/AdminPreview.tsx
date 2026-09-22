"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import type { AdminObjectSnapshot } from "@/types/domain";

type AdminPreviewValue = {
  companyName: string;
  actorLabel: string;
  objects: AdminObjectSnapshot[];
  selectedId: string;
  selected: AdminObjectSnapshot | null;
  select: (id: string) => void;
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
  const pathname = usePathname();
  const [selectedId, setSelectedId] = useState(initialObjects[0]?.id ?? "");
  const routeMatch = pathname.match(/^\/admin\/objects\/([^/]+)$/);
  const routeId = routeMatch && initialObjects.some((object) => object.id === routeMatch[1]) ? routeMatch[1] : null;
  const activeId = routeId ?? selectedId;
  const selected = initialObjects.find((object) => object.id === activeId) ?? initialObjects[0] ?? null;

  return (
    <AdminPreviewContext.Provider
      value={{
        companyName,
        actorLabel,
        objects: initialObjects,
        selectedId: selected?.id ?? "",
        selected,
        select: setSelectedId,
      }}
    >
      {children}
    </AdminPreviewContext.Provider>
  );
}

export function useAdminPreview() {
  const value = useContext(AdminPreviewContext);
  if (!value) {
    throw new Error("Admin preview is unavailable");
  }
  return value;
}
