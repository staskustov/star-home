import Link from "next/link";
import { InstantDevice } from "@/components/home/InstantDevice";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { requireHome } from "@/server/access";

export default async function DevicesPage() {
  const home = await requireHome();
  const faults = home.devices.filter((device) => device.state === "FAULT").length;
  const devices = [...home.devices].sort((a, b) => order(a.state) - order(b.state));

  return (
    <section>
      <LiveRefresh />
      <h1 className="text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">Устройства</h1>
      <p className="mt-2 text-[15px] text-muted">
        {home.object.name} · {home.unit.name}
      </p>

      {home.devices.length > 0 ? (
        <div className="panel mt-7 flex items-center gap-4 px-5 py-4">
          <span className="tile-icon">
            <Icon name="security" className={`h-[18px] w-[18px] ${faults ? "text-danger" : "text-success"}`} />
          </span>
          <div>
            <p className={`text-[17px] ${faults ? "text-danger" : "text-ink"}`}>{faults ? "Есть проблема" : "Всё работает"}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {faults ? `Неисправно: ${faults}` : `Устройств: ${home.devices.length}`}
            </p>
          </div>
        </div>
      ) : null}

      <ul className="panel mt-4 overflow-hidden">
        {devices.length === 0 ? (
          <li className="list-row text-[15px] text-muted">Устройств нет.</li>
        ) : (
          devices.map((device) => (
            <li key={device.id ?? `${device.label}-${device.name}`} className="list-row !items-start">
              <div className="min-w-0 flex-1">
                <InstantDevice device={device} canGate={home.canGate} canCommand={home.canCommand} href={device.id ? `/devices/${device.id}` : undefined} />
              </div>
            </li>
          ))
        )}
      </ul>
      <p className="mt-4">
        <Link href="/events" className="text-[15px] text-muted">
          События дома
        </Link>
      </p>
    </section>
  );
}

function order(state: "ON" | "OFF" | "FAULT") {
  return state === "FAULT" ? 0 : state === "OFF" ? 1 : 2;
}
