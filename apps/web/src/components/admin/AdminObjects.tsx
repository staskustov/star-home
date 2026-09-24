"use client";

import { useRouter } from "next/navigation";
import { AddObjectButton } from "@/components/admin/ObjectDraftSheet";
import { ObjectCard } from "@/components/admin/ObjectCard";
import { useAdminPreview } from "@/components/admin/AdminPreview";

export function AdminObjects() {
  const router = useRouter();
  const { objects, selectedId, select, can } = useAdminPreview();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Объекты</h1>
        {can("objects.create") ? <AddObjectButton /> : null}
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {objects.map((object) => (
          <ObjectCard
            key={object.id}
            object={object}
            selected={object.id === selectedId}
            onSelect={(id) => {
              select(id);
              router.push("/admin");
            }}
          />
        ))}
      </div>
    </div>
  );
}
