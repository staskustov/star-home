import Link from "next/link";
import { objectPresentation, structureLine } from "@/lib/object-presentation";
import type { AdminObjectSnapshot } from "@/types/domain";

export function ObjectCard({
  object,
  selected,
  onSelect,
}: {
  object: AdminObjectSnapshot;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const presentation = objectPresentation[object.type];
  return (
    <div
      className={`panel px-5 py-5 transition-shadow duration-200 ${selected ? "ring-2 ring-accent" : ""}`}
    >
      <button type="button" onClick={() => onSelect(object.id)} aria-pressed={selected} className="w-full text-left">
        <h3 className="text-[22px] tracking-[-0.03em] text-ink">{object.name}</h3>
        <p className="mt-1 text-sm text-muted">{presentation.label}</p>
        <p className="mt-4 text-[15px] text-graphite">{structureLine(object.type, object.buildings, object.units)}</p>
      </button>
      <Link href={`/admin/objects/${object.id}`} className="btn btn-secondary btn-compact mt-5">
        Структура
      </Link>
    </div>
  );
}
