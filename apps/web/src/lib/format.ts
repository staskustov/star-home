export function plural(count: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  const word =
    abs > 10 && abs < 20 ? forms[2] : last === 1 ? forms[0] : last > 1 && last < 5 ? forms[1] : forms[2];
  return `${count} ${word}`;
}

export function formatTemperature(celsius: number): string {
  const value = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(celsius);
  return `${value}°`;
}

export function formatHumidity(percent: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(percent)}%`;
}

export function formatChannelValue(value: number | boolean | string | null | undefined, unit = "", precision?: number): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "string") return unit ? `${value} ${unit}`.trim() : value;
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: precision ?? (Number.isInteger(value) ? 0 : 1),
    maximumFractionDigits: precision ?? (Number.isInteger(value) ? 0 : 1),
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatLastContact(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "нет контакта";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "нет контакта";
  const delta = Math.max(0, now - at);
  if (delta < 15_000) return "только что";
  if (delta < 60_000) return `${Math.floor(delta / 1000)} сек назад`;
  if (delta < 60 * 60_000) {
    const minutes = Math.floor(delta / 60_000);
    return minutes === 1 ? "1 мин назад" : `${minutes} мин назад`;
  }
  if (delta < 24 * 60 * 60_000) {
    const hours = Math.floor(delta / (60 * 60_000));
    return hours === 1 ? "1 ч назад" : `${hours} ч назад`;
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at);
}

export function gatewayErrorText(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  const known: Record<string, string> = {
    "mqtt-offline": "Нет MQTT",
    "mqtt-reconnect": "Переподключение MQTT",
    "mqtt-connecting": "Подключение к MQTT",
    "mqtt-timeout": "Таймаут команды",
    "mqtt-publish-failed": "Публикация MQTT не прошла",
    "heartbeat-stale": "Нет heartbeat",
    "broker-forbidden": "Брокер не localhost",
    "broker-unconfigured": "Брокер не задан",
    "gateway-offline": "Шлюз не на связи",
  };
  return known[error.trim()] ?? error.trim();
}

export function gatewayStatusLabel(status: string, lastSeen: string | null | undefined): string {
  if (!lastSeen) return "Нет контакта";
  if (status === "OFFLINE" || status === "UNKNOWN") return "Нет связи";
  if (status === "DEGRADED") return "Связь нестабильна";
  return "На связи";
}

export function formatProbeResult(elapsedMs: number | null | undefined, result: string | null | undefined): string | null {
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs)) return null;
  const ms = Math.max(0, Math.round(elapsedMs));
  return result === "confirmed" ? `${ms} мс · подтверждено` : `${ms} мс · нет ответа`;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
