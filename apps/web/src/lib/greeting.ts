export function greetingForHour(hour: number, name: string): string {
  if (hour < 5 || hour >= 23) return `Доброй ночи, ${name}`;
  if (hour < 12) return `Доброе утро, ${name}`;
  if (hour < 18) return `Добрый день, ${name}`;
  return `Добрый вечер, ${name}`;
}
