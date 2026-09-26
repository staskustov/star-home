import Link from "next/link";
import { DeviceCommand } from "@/components/home/DeviceCommand";
import { Icon } from "@/components/icons";
import { requireRoom } from "@/server/access";

const stateLabel = { ON: "Включено", OFF: "Отключено", FAULT: "Неисправно", ONLINE: "На связи", OFFLINE: "Нет связи", UNKNOWN: "Нет данных" } as const;

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { room, devices } = await requireRoom(id);
  return (
    <section>
      <p className="text-[13px] text-muted">
        <Link href="/rooms">Помещения</Link>
      </p>
      <h1 className="mt-2 text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">{room.name}</h1>
      <ul className="mt-7 space-y-4">
        {devices.length === 0 ? <li className="panel list-row text-[15px] text-muted">В этом помещении устройств нет.</li> : null}
        {devices.map((device) => (
          <li key={device.id} className="panel px-5 py-5">
            <Link href={`/devices/${device.id}`} className="flex min-w-0 items-center gap-[14px]">
              <span className="tile-icon">
                <Icon name="devices" className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] text-ink">{device.name}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{device.typeLabel}</span>
              </span>
              <span className="text-[13px] text-muted">{device.stale ? "Нет связи" : stateLabel[device.availability] ?? device.availability}</span>
              <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
            </Link>
            {device.canCommand && device.commands.length ? (
              <div className="mt-4">
                <DeviceCommand
                  deviceId={device.id}
                  commands={device.commands}
                  canCommand={device.canCommand}
                  state={device.state as { on?: boolean; brightness?: number; targetC?: number; position?: number; latch?: string }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
