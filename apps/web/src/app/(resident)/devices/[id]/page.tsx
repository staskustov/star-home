import { ChannelReadings } from "@/components/home/ChannelReadings";
import { DeviceCommand } from "@/components/home/DeviceCommand";
import { FavoriteButton } from "@/components/home/FavoriteButton";
import { HistoryPanel } from "@/components/home/HistoryPanel";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { requireSmartDevice } from "@/server/access";

const availabilityLabel: Record<string, string> = {
  ONLINE: "На связи",
  OFFLINE: "Нет связи",
  UNKNOWN: "Нет данных",
};

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { device } = await requireSmartDevice(id);
  const state = device.state ?? {};

  return (
    <section>
      <LiveRefresh />
      <p className="text-[13px] text-muted">{device.roomName ?? "Дом"}</p>
      <h1 className="mt-2 text-[28px] tracking-[-0.035em] text-ink sm:text-[34px]">{device.name}</h1>
      <p className="mt-2 text-[15px] text-muted">
        {device.typeLabel}
        {device.source === "DEMO" ? " · демо" : device.source === "MOCK" ? " · симулятор" : ""}
      </p>

      <div className="panel mt-7 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="tile-icon">
            <Icon name="devices" className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className={`text-[17px] ${device.stale ? "text-warning" : "text-ink"}`}>
              {device.stale ? (device.lastKnown ? "Последнее известное состояние" : "Нет свежих данных") : (availabilityLabel[device.availability] ?? device.availability)}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">{device.lastSeen ? `Последний раз ${device.lastSeen}` : "Время связи неизвестно"}</p>
          </div>
        </div>
        {device.channels?.length ? (
          <ChannelReadings channels={device.channels} />
        ) : (
          <dl className="mt-5 grid gap-3 text-[15px]">
            {state.on !== undefined ? (
              <div className="flex justify-between">
                <dt className="text-muted">Питание</dt>
                <dd>{state.on ? "Включено" : "Выключено"}</dd>
              </div>
            ) : null}
            {typeof state.temperatureC === "number" ? (
              <div className="flex justify-between">
                <dt className="text-muted">Температура</dt>
                <dd>{String(state.temperatureC).replace(".", ",")}°</dd>
              </div>
            ) : null}
          </dl>
        )}
        {!(device.channels?.length || Object.keys(state).length) ? <p className="mt-4 text-[15px] text-muted">Показаний нет.</p> : null}
        {device.stale && device.lastKnown ? <p className="mt-3 text-[13px] text-muted">Цифры на момент последней связи, не текущие.</p> : null}
        <FavoriteButton deviceId={device.id} favorite={device.favorite} />
      </div>

      <div className="panel mt-4 px-5 py-5">
        <h2 className="mb-4 text-[19px] tracking-[-0.02em] text-ink">Управление</h2>
        <DeviceCommand
          deviceId={device.id}
          commands={device.commands}
          canCommand={device.canCommand}
          state={state}
          stale={device.stale}
        />
      </div>

      <div className="panel mt-4 px-5 py-5">
        <h2 className="mb-4 text-[19px] tracking-[-0.02em] text-ink">История</h2>
        <HistoryPanel
          deviceId={id}
          channels={device.channels?.map((channel) => ({
            capability: channel.capability ?? "",
            displayName: channel.displayName,
            unit: channel.unit,
          }))}
        />
      </div>
    </section>
  );
}
