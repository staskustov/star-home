import Link from "next/link";
import { FloorPlan } from "@/components/home/FloorPlan";
import { Icon } from "@/components/icons";
import { formatHumidity, formatTemperature } from "@/lib/format";
import { houseReadout } from "@/lib/house-status";
import { requireFloorPlan, requireHome, requireSmartRooms } from "@/server/access";

export default async function RoomsPage() {
  const home = await requireHome();
  const floors = await requireFloorPlan(home.unit.id);
  const rooms = await requireSmartRooms();
  const mode = home.lifeModes.find((item) => item.mode === home.activeLifeMode) ?? home.lifeModes[0];
  const readout = mode ? houseReadout(home.devices, mode) : null;
  const problem = readout?.tone === "danger";
  const security = problem ? "Есть проблема" : (mode?.securityLabel ?? "—");

  return (
    <section>
      <h1 className="text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">Помещения</h1>
      <p className="mt-2 text-[15px] text-muted">
        {home.object.name} · {home.unit.name}
      </p>

      <dl className="panel mt-7 grid grid-cols-3 divide-x divide-line/60 px-5 py-4">
        <div className="pr-3">
          <dt className="flex flex-col gap-1.5 text-[13px] text-muted">
            <Icon name="thermo" className="h-4 w-4" />
            Температура
          </dt>
          <dd className="mt-1.5 text-[24px] leading-none tracking-[-0.04em] text-ink">
            {home.climate ? formatTemperature(home.climate.temperatureC) : "—"}
          </dd>
        </div>
        <div className="px-3">
          <dt className="flex flex-col gap-1.5 text-[13px] text-muted">
            <Icon name="drop" className="h-4 w-4" />
            Влажность
          </dt>
          <dd className="mt-1.5 text-[24px] leading-none tracking-[-0.04em] text-ink">
            {home.climate ? formatHumidity(home.climate.humidityPercent) : "—"}
          </dd>
        </div>
        <div className="pl-3">
          <dt className="flex flex-col gap-1.5 text-[13px] text-muted">
            <Icon name="security" className={`h-4 w-4 ${problem ? "text-danger" : "text-success"}`} />
            Защита
          </dt>
          <dd className={`mt-1.5 text-[15px] leading-tight ${problem ? "text-danger" : "text-success"}`}>{security}</dd>
        </div>
      </dl>

      {rooms.length === 0 ? (
        <p className="panel mt-4 px-5 py-5 text-[15px] text-muted">Помещения для этого объекта пока не добавлены.</p>
      ) : (
        <ul className="panel mt-4 overflow-hidden">
          {rooms.map((room) => {
            const facts = [
              room.temperatureC != null ? formatTemperature(room.temperatureC) : null,
              room.humidityPercent != null ? formatHumidity(room.humidityPercent) : null,
              room.lights ? `Свет ${room.lights.on} из ${room.lights.total}` : null,
              room.curtain != null ? `Шторы ${room.curtain}%` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={room.id} className="list-row">
                <Link href={`/rooms/${room.id}`} className="-my-1 flex min-w-0 flex-1 items-center gap-[14px] py-1">
                  <span className="tile-icon">
                    <Icon name="rooms" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] text-ink">{room.name}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      {facts || (room.deviceCount ? `Устройств: ${room.deviceCount}` : "Пусто")}
                    </span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-8 text-[19px] tracking-[-0.02em] text-ink">План</h2>
      <FloorPlan floors={floors} />
    </section>
  );
}
