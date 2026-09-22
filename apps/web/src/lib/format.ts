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

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
