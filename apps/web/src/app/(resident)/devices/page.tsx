import { Icon, type IconName } from "@/components/icons";
import { requireHome } from "@/server/access";

const stateLabel = { ON: "Включено", OFF: "Отключено", FAULT: "Неисправно" } as const;
const stateText = { ON: "text-success", OFF: "text-muted", FAULT: "text-danger" } as const;
const stateDot = { ON: "bg-success", OFF: "bg-muted", FAULT: "bg-danger" } as const;

const kindIcon: Record<string, IconName> = {
  Ворота: "gate",
  Калитка: "gate",
  Шлагбаум: "gate",
  Замок: "lock",
  Климат: "climate",
  Камера: "camera",
  Протечка: "leak",
};

export default async function DevicesPage() {
  const home = await requireHome();
  const faults = home.devices.filter((device) => device.state === "FAULT").length;
  const devices = [...home.devices].sort((a, b) => order(a.state) - order(b.state));

  return (
    <section>
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
            <li key={`${device.label}-${device.name}`} className="list-row">
              <span className="tile-icon">
                <Icon name={kindIcon[device.label] ?? "devices"} className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-ink">{device.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">{device.label}</p>
              </div>
              <p className={`flex shrink-0 items-center gap-2 text-[14px] ${stateText[device.state]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${stateDot[device.state]}`} aria-hidden />
                {stateLabel[device.state]}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function order(state: "ON" | "OFF" | "FAULT") {
  return state === "FAULT" ? 0 : state === "OFF" ? 1 : 2;
}
