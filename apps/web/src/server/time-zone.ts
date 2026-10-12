export const timeZone = process.env.STAR_HOME_TIME_ZONE || "Europe/Moscow";

function zoneOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - at;
}

export function zonedDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!local) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const guess = Date.UTC(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4] ?? 0), Number(local[5] ?? 0), Number(local[6] ?? 0));
  if (!Number.isFinite(guess)) return null;
  return new Date(guess - zoneOffsetMs(guess));
}
