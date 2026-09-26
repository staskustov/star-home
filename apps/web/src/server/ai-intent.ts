export type AiToolName = "open_gate" | "create_pass" | "create_request" | "pay" | "switch_mode" | "control_device" | "set_temperature";

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
  | "energy";

export type AiIntent = {
  tool: AiToolName | null;
  query: AiQuery | null;
  mode: "HOME" | "WORK" | "VACATION" | null;
  reply: string;
  deviceHint?: string;
  command?: string;
  value?: unknown;
};

const empty: AiIntent = { tool: null, query: null, mode: null, reply: "" };

export function intentFromPrompt(prompt: string): AiIntent {
  const text = prompt.toLowerCase();
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
    return { ...empty, query: "device_status" };
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
