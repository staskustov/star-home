import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Tone } from "@/types/domain";

export function SecurityStatus({ label, state, tone }: { label: string; state: string; tone: Tone }) {
  return (
    <section className="flex items-center justify-between panel px-5 py-4">
      <h2 className="text-[17px] text-ink">{label}</h2>
      <StatusBadge tone={tone}>{state}</StatusBadge>
    </section>
  );
}
