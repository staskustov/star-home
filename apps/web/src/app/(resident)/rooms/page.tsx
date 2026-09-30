import Link from "next/link";
import { FloorPlan } from "@/components/home/FloorPlan";
import { MetricChip, metricLook } from "@/components/home/MetricChip";
import { Icon } from "@/components/icons";
import { formatHumidity, formatTemperature } from "@/lib/format";
import { requireFloorPlan, requireHome, requireSmartRooms } from "@/server/access";

function devicesLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} устройство`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} устройства`;
  return `${count} устройств`;
}

export default async function RoomsPage() {
  const home = await requireHome();
  const floors = await requireFloorPlan(home.unit.id);
  const rooms = await requireSmartRooms();
  const temp = metricLook(home.weather?.metrics, "temperature");
  const humidity = metricLook(home.weather?.metrics, "humidity");

  return (
    <section>
      <h1 className="text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">Помещения</h1>
      <p className="mt-2 text-[15px] text-muted">
        {home.object.name} · {home.unit.name}
      </p>

      <dl className="panel mt-7 grid grid-cols-2 divide-x divide-line/60 px-5 py-4">
        <div className="pr-3">
          <dt className="flex flex-col gap-1.5 text-[15px] text-ink">
            <span style={{ color: temp.color }}>
              <Icon name={temp.icon} className="h-4 w-4" />
            </span>
            {temp.label}
          </dt>
          <dd className="mt-1.5 text-[24px] leading-none tracking-[-0.04em]" style={{ color: home.climate ? temp.color : undefined }}>
            {home.climate ? formatTemperature(home.climate.temperatureC) : "—"}
          </dd>
        </div>
        <div className="pl-3">
          <dt className="flex flex-col gap-1.5 text-[15px] text-ink">
            <span style={{ color: humidity.color }}>
              <Icon name={humidity.icon} className="h-4 w-4" />
            </span>
            {humidity.label}
          </dt>
          <dd className="mt-1.5 text-[24px] leading-none tracking-[-0.04em]" style={{ color: home.climate ? humidity.color : undefined }}>
            {home.climate ? formatHumidity(home.climate.humidityPercent) : "—"}
          </dd>
        </div>
      </dl>

      {rooms.length === 0 ? (
        <p className="panel mt-4 px-5 py-5 text-[15px] text-muted">Помещения для этого объекта пока не добавлены.</p>
      ) : (
        <ul className="panel mt-4 overflow-hidden">
          {rooms.map((room) => {
            const extras = [room.lights ? `Свет ${room.lights.on} из ${room.lights.total}` : null, room.curtain != null ? `Шторы ${room.curtain}%` : null].filter((item): item is string => Boolean(item));
            return (
              <li key={room.id} className="list-row">
                <Link href={`/rooms/${room.id}`} className="-my-1 flex min-w-0 flex-1 items-center gap-[14px] py-1">
                  <span className="tile-icon">
                    <Icon name="rooms" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] text-ink">{room.name}</span>
                    {room.temperatureC != null || room.humidityPercent != null || extras.length ? (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                        {room.temperatureC != null ? (
                          <MetricChip compact icon={temp.icon} color={temp.color} label={temp.label} value={formatTemperature(room.temperatureC)} />
                        ) : null}
                        {room.humidityPercent != null ? (
                          <MetricChip compact icon={humidity.icon} color={humidity.color} label={humidity.label} value={formatHumidity(room.humidityPercent)} />
                        ) : null}
                        {extras.map((item) => (
                          <span key={item} className="text-muted">
                            {item}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[13px] text-muted">{devicesLabel(room.deviceCount ?? 0)}</span>
                    )}
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-8 text-[19px] tracking-[-0.02em] text-ink">План</h2>
      <FloorPlan floors={floors} canCommand={home.canCommand === true} />
    </section>
  );
}
