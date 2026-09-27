export type AiToolName = "open_gate" | "create_pass" | "create_request" | "pay" | "switch_mode" | "control_device" | "set_temperature" | "run_scenario";

export type AiQuery =
  | "status"
  | "visitors"
  | "balance"
  | "rooms"
  | "devices"
  | "device_status"
  | "security_status"
  | "open_doors"
  | "alerts"
  | "energy"
  | "room_climate"
  | "device_channels";

export type AiIntent = {
  tool: AiToolName | null;
  query: AiQuery | null;
  mode: "HOME" | "WORK" | "VACATION" | null;
  reply: string;
  deviceHint?: string;
  roomHint?: string;
  command?: string;
  value?: unknown;
  scenarioHint?: string;
};

const queryAliases: Record<string, AiQuery> = {
  status: "status",
  visitors: "visitors",
  balance: "balance",
  rooms: "rooms",
  devices: "devices",
  device_status: "device_status",
  security_status: "security_status",
  open_doors: "open_doors",
  alerts: "alerts",
  energy: "energy",
  room_climate: "room_climate",
  get_room_climate: "room_climate",
  device_channels: "device_channels",
  get_device_channels: "device_channels",
  get_sensor_value: "device_channels",
};

export function normalizeAiQuery(value: unknown): AiQuery | null {
  return typeof value === "string" && value in queryAliases ? queryAliases[value] : null;
}

const empty: AiIntent = { tool: null, query: null, mode: null, reply: "" };

export function intentFromPrompt(prompt: string): AiIntent {
  const text = prompt.toLowerCase();
  if (text.includes("mqtt") || text.includes("topic") || text.includes("топик")) {
    return { tool: null, query: null, mode: null, reply: "Технические адреса недоступны." };
  }
  if (text.includes("ворот")) {
    return { tool: "open_gate", query: null, mode: null, reply: "Открыть ворота? Подтвердите действие." };
  }
  if (text.includes("кто") && (text.includes("приед") || text.includes("гост"))) {
    return { ...empty, query: "visitors" };
  }
  if (text.includes("пропуск") || text.includes("гость")) {
    return { tool: "create_pass", query: null, mode: null, reply: "Оформить пропуск для гостя? Подтвердите действие." };
  }
  if (text.includes("заяв")) {
    return { tool: "create_request", query: null, mode: null, reply: "Создать заявку? Подтвердите действие." };
  }
  if (text.includes("сколько") || text.includes("должен") || text.includes("коммунал")) {
    return { ...empty, query: "balance" };
  }
  if (text.includes("оплат")) {
    return { tool: "pay", query: null, mode: null, reply: "Оплатить открытый счёт? Подтвердите действие." };
  }
  if (text.includes("отпуск")) {
    return { tool: "switch_mode", query: null, mode: "VACATION", reply: "Перевести дом в режим «В отпуске»? Подтвердите действие." };
  }
  if (text.includes("работ")) {
    return { tool: "switch_mode", query: null, mode: "WORK", reply: "Перевести дом в режим «На работе»? Подтвердите действие." };
  }
  if (text.includes("я дома") || text.includes("режим дома")) {
    return { tool: "switch_mode", query: null, mode: "HOME", reply: "Перевести дом в режим «Дома»? Подтвердите действие." };
  }
  if (text.includes("температур") || text.includes("градус") || text.includes("тепл") || text.includes("холод")) {
    const match = text.match(/(-?\d+[.,]?\d*)/);
    if (match) {
      return {
        tool: "set_temperature",
        query: null,
        mode: null,
        reply: `Поставить ${match[1].replace(",", ".")}°? Подтвердите действие.`,
        command: "setTemperature",
        value: Number(match[1].replace(",", ".")),
      };
    }
    return { ...empty, query: "room_climate", roomHint: roomHintFrom(text) };
  }
  if (text.includes("показан") || text.includes("канал") || text.includes("датчик") || text.includes("co2") || text.includes("влажност") || text.includes("освещен")) {
    return { ...empty, query: "device_channels", deviceHint: roomHintFrom(text) || (text.includes("свет") ? "light" : "climate") };
  }
  if (text.includes("свет") || text.includes("ламп") || text.includes("штор") || text.includes("выключ") || text.includes("включ")) {
    const off = text.includes("выключ");
    return {
      tool: "control_device",
      query: null,
      mode: null,
      reply: off ? "Выключить устройство? Подтвердите действие." : "Включить устройство? Подтвердите действие.",
      deviceHint: text.includes("штор") ? "curtain" : "light",
      command: text.includes("штор") ? (off || text.includes("закры") ? "close" : "open") : "setPower",
      value: text.includes("штор") ? undefined : !off,
    };
  }
  if (text.includes("сценари") || text.includes("ночь") || (text.includes("запуст") && text.includes("дом"))) {
    const named = text.match(/сценари[яй]\s+(.+)$/);
    return {
      tool: "run_scenario",
      query: null,
      mode: null,
      reply: "Запустить сценарий? Подтвердите действие.",
      scenarioHint: named?.[1]?.trim() || (text.includes("ночь") ? "ночь" : undefined),
    };
  }
  if (text.includes("климат")) return { ...empty, query: "room_climate", roomHint: roomHintFrom(text) };
  if (text.includes("комнат") || text.includes("помещен")) return { ...empty, query: "rooms" };
  if (text.includes("устройств")) return { ...empty, query: "devices" };
  if (text.includes("двер") || text.includes("калитка") || text.includes("шлагбаум") || text.includes("замок")) {
    return { ...empty, query: "open_doors" };
  }
  if (text.includes("тревог") || text.includes("протеч") || text.includes("пожар") || text.includes("дым")) {
    return { ...empty, query: "alerts" };
  }
  if (text.includes("энерг") || text.includes("розетк")) return { ...empty, query: "energy" };
  if (text.includes("охран") || text.includes("безопасн")) return { ...empty, query: "security_status" };
  if (text.includes("провер") || text.includes("статус") || text.includes("что дома")) return { ...empty, query: "status" };
  return empty;
}

function roomHintFrom(text: string): string | undefined {
  const named = text.match(/(?:в|для)\s+([а-яё]+)/i);
  if (named?.[1]) return named[1];
  if (text.includes("гостин")) return "гостиная";
  if (text.includes("спальн")) return "спальня";
  if (text.includes("кухн")) return "кухня";
  return undefined;
}
