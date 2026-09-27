import { formatChannelValue } from "@/lib/format";

export type ReadingChannel = {
  displayName: string;
  unit: string;
  value: number | boolean | string | null;
};

export function channelSummary(channels: ReadingChannel[] | undefined, limit = 4): string {
  return (channels ?? [])
    .filter((channel) => channel.value !== null && channel.value !== undefined)
    .slice(0, limit)
    .map((channel) => `${channel.displayName} ${formatChannelValue(channel.value, channel.unit)}`)
    .join(" · ");
}

export function ChannelReadings({ channels }: { channels?: ReadingChannel[] }) {
  const rows = (channels ?? []).filter((channel) => channel.value !== null && channel.value !== undefined);
  if (!rows.length) return null;
  return (
    <dl className="mt-5 grid gap-3 text-[15px]">
      {rows.map((channel) => (
        <div key={channel.displayName} className="flex justify-between gap-3">
          <dt className="text-muted">{channel.displayName}</dt>
          <dd>{formatChannelValue(channel.value, channel.unit)}</dd>
        </div>
      ))}
    </dl>
  );
}
