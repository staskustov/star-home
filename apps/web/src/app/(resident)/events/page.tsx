import Link from "next/link";
import { requireHome, requireSmartEvents } from "@/server/access";

export default async function EventsPage() {
  const home = await requireHome();
  const events = await requireSmartEvents();
  return (
    <section>
      <h1 className="text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">События</h1>
      <p className="mt-2 text-[15px] text-muted">
        {home.object.name} · {home.unit.name}
      </p>
      <ul className="panel mt-7 overflow-hidden">
        {events.length === 0 ? <li className="list-row text-[15px] text-muted">Событий пока нет.</li> : null}
        {events.map((event) => (
          <li key={event.id} className="list-row">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] text-ink">{event.title}</span>
              <span className="mt-0.5 block text-[13px] text-muted">
                {event.at} · {event.result}
                {event.severity && event.severity !== "INFO" ? ` · ${event.severity === "ALERT" ? "тревога" : "внимание"}` : ""}
              </span>
            </span>
            {event.deviceId ? (
              <Link href={`/devices/${event.deviceId}`} className="text-[13px] text-muted">
                Устройство
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
