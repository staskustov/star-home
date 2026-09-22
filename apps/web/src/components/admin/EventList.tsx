import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccessEvent } from "@/types/domain";

export function EventList({ events }: { events: AccessEvent[] }) {
  return (
    <section className="rounded-[20px] border border-line bg-surface px-5 py-5">
      <h2 className="text-[20px] tracking-[-0.03em] text-ink">События доступа</h2>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Событий пока нет.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] text-ink">{event.title}</p>
                <p className="text-sm text-muted">{event.time}</p>
              </div>
              <StatusBadge tone={event.result === "SUCCESS" ? "success" : "danger"}>
                {event.result === "SUCCESS" ? "Разрешено" : "Отказ"}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
