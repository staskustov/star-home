import { MetricCard } from "@/components/ui/MetricCard";
import { plural } from "@/lib/format";
import { objectPresentation } from "@/lib/object-presentation";
import type { AdminObjectSnapshot } from "@/types/domain";

export function AdminStats({ object }: { object: AdminObjectSnapshot }) {
  const presentation = objectPresentation[object.type];
  const unitLabel = plural(object.units, presentation.unitForms).split(" ").slice(1).join(" ");
  const items = [
    { value: String(object.units), label: unitLabel, tone: "info" as const },
    { value: String(object.residents), label: plural(object.residents, ["житель", "жителя", "жителей"]).split(" ").slice(1).join(" "), tone: "info" as const },
    { value: String(object.visitors), label: plural(object.visitors, ["гость", "гостя", "гостей"]).split(" ").slice(1).join(" "), tone: "info" as const },
    { value: String(object.requests), label: plural(object.requests, ["заявка", "заявки", "заявок"]).split(" ").slice(1).join(" "), tone: "info" as const },
    {
      value: String(object.alarms),
      label: plural(object.alarms, ["тревога", "тревоги", "тревог"]).split(" ").slice(1).join(" "),
      tone: object.alarms > 0 ? ("danger" as const) : ("info" as const),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <MetricCard key={item.label} value={item.value} label={item.label} tone={item.tone} />
      ))}
    </div>
  );
}
