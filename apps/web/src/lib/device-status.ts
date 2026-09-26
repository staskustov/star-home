export type DeviceWork = "ON" | "OFF" | "FAULT";
export type Latch = "OPEN" | "CLOSED";

export function deviceStatus(input: {
  stale?: boolean;
  work?: DeviceWork;
  power?: boolean;
  latch?: Latch;
}): { text: string; tone: "success" | "warning" | "danger" | "muted" } {
  if (input.stale) return { text: "Нет связи", tone: "warning" };
  if (input.work === "FAULT") return { text: "Неисправно", tone: "danger" };
  if (input.work === "OFF") return { text: "Отключено", tone: "warning" };
  if (input.latch) return input.latch === "OPEN" ? { text: "Открыто", tone: "success" } : { text: "Закрыто", tone: "muted" };
  if (input.power === true) return { text: "Включено", tone: "success" };
  if (input.power === false) return { text: "Выключено", tone: "muted" };
  return { text: "Включено", tone: "success" };
}

export function statusClass(tone: "success" | "warning" | "danger" | "muted"): string {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "text-muted";
}

export function statusDot(tone: "success" | "warning" | "danger" | "muted"): string {
  if (tone === "success") return "bg-success";
  if (tone === "warning") return "bg-warning";
  if (tone === "danger") return "bg-danger";
  return "bg-muted";
}
