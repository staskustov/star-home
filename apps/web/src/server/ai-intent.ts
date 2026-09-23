export type AiToolName = "open_gate" | "create_pass" | "create_request" | "pay" | "switch_mode";

export type AiQuery = "status" | "visitors" | "balance";

export type AiIntent = {
  tool: AiToolName | null;
  query: AiQuery | null;
  mode: "HOME" | "WORK" | "VACATION" | null;
  reply: string;
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
  if (text.includes("провер")) return { ...empty, query: "status" };
  return empty;
}
