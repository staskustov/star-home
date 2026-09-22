import { placeFromSession, residentPlace, type Place, type SessionRef } from "@/server/actor";
import { modeForUnit } from "@/server/life-mode-store";
import { createPass, createRequest, openGate, payOldest } from "@/server/operations";
import { homeSignals, newId, readOps, writeOps, type PendingTool } from "@/server/ops-store";

export type AiReply = {
  reply: string;
  confirmToken: string | null;
};

type Proposal = {
  reply: string;
  pending: PendingTool | null;
};

function rules(prompt: string): { tool: PendingTool["name"] | null; reply: string } {
  const text = prompt.toLowerCase();
  if (text.includes("ворот")) return { tool: "open_gate", reply: "Открыть ворота? Подтвердите действие." };
  if (text.includes("пропуск") || text.includes("гость")) return { tool: "create_pass", reply: "Оформить пропуск для гостя? Подтвердите действие." };
  if (text.includes("заяв")) return { tool: "create_request", reply: "Создать заявку? Подтвердите действие." };
  if (text.includes("оплат")) return { tool: "pay", reply: "Оплатить открытый счёт? Подтвердите действие." };
  return { tool: null, reply: "" };
}

const allowedTools = new Set<PendingTool["name"]>(["open_gate", "create_pass", "create_request", "pay"]);

async function propose(prompt: string, role: Place["role"]): Promise<Proposal> {
  const endpoint = process.env.STAR_HOME_LLM_URL;
  let suggestion = rules(prompt);
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).catch(() => null);
    const payload = response?.ok ? ((await response.json().catch(() => null)) as { tool?: string; reply?: string } | null) : null;
    if (!payload || (payload.tool && !allowedTools.has(payload.tool as PendingTool["name"]))) {
      return { reply: "Не удалось подтвердить выполнение.", pending: null };
    }
    suggestion = {
      tool: (payload.tool as PendingTool["name"] | undefined) ?? null,
      reply: payload.reply || suggestion.reply,
    };
  }
  if (suggestion.tool === "pay" && role !== "RESIDENT") return { reply: "Оплата доступна только жителю.", pending: null };
  if (suggestion.tool === "create_pass" && role !== "RESIDENT") return { reply: "Пропуск оформляет житель.", pending: null };
  if (!suggestion.tool) return { reply: "", pending: null };
  return { reply: suggestion.reply, pending: { name: suggestion.tool, token: newId("confirm") } };
}

export async function askAssistant(place: Place, prompt: string): Promise<AiReply> {
  const proposal = await propose(prompt, place.role);
  if (!proposal.pending) {
    const signals = homeSignals(place.unitId, place.objectId);
    const mode = modeForUnit(place.unitId);
    const temperature = signals.climate ? `${signals.climate.temperatureC.toString().replace(".", ",")}°` : "нет данных";
    const reply = `Сейчас ${temperature}. Режим ${mode}. Могу открыть ворота, оформить пропуск, создать заявку или оплатить счёт.`;
    const file = readOps();
    file.turns.unshift({
      id: newId("turn"),
      companyId: place.companyId,
      userId: place.userId,
      unitId: place.unitId,
      prompt,
      reply,
      pending: null,
    });
    writeOps(file);
    return { reply, confirmToken: null };
  }
  const file = readOps();
  file.turns.unshift({
    id: newId("turn"),
    companyId: place.companyId,
    userId: place.userId,
    unitId: place.unitId,
    prompt,
    reply: proposal.reply,
    pending: proposal.pending,
  });
  writeOps(file);
  return { reply: proposal.reply, confirmToken: proposal.pending.token };
}

export async function confirmAssistant(place: Place, token: string): Promise<AiReply> {
  const file = readOps();
  const turn = file.turns.find((item) => item.userId === place.userId && item.pending?.token === token);
  if (!turn?.pending) return { reply: "Подтверждение не найдено.", confirmToken: null };
  const tool = turn.pending.name;
  turn.pending = null;
  writeOps(file);
  let reply = "Не удалось подтвердить выполнение.";
  if (tool === "open_gate") reply = (await openGate(place)).message;
  if (tool === "create_pass" && place.role === "RESIDENT") {
    createPass(place, "Гость", "По запросу в чате");
    reply = "Пропуск оформлен.";
  }
  if (tool === "create_request") {
    createRequest(place, "Другое", turn.prompt);
    reply = "Заявка создана.";
  }
  if (tool === "pay" && place.role === "RESIDENT") reply = (await payOldest(place)).message;
  const next = readOps();
  const saved = next.turns.find((item) => item.id === turn.id);
  if (saved) saved.reply = reply;
  writeOps(next);
  return { reply, confirmToken: null };
}

export async function askFor(session: SessionRef | null, prompt: unknown) {
  const place = placeFromSession(session);
  if (!place.ok) return place;
  const text = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (!text) return { ok: false as const, status: 400, message: "Напишите запрос" };
  if (text.length > 400) return { ok: false as const, status: 400, message: "Слишком длинный запрос" };
  return { ok: true as const, value: await askAssistant(place.value, text) };
}

export async function confirmFor(session: SessionRef | null, token: unknown) {
  const place = placeFromSession(session);
  if (!place.ok) return place;
  if (typeof token !== "string" || !token) return { ok: false as const, status: 400, message: "Подтверждение не найдено." };
  return { ok: true as const, value: await confirmAssistant(place.value, token) };
}

export async function askOwnAssistant(prompt: unknown) {
  const place = await residentPlace();
  if (!place.ok) return place;
  const text = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (!text) return { ok: false as const, status: 400, message: "Напишите запрос" };
  if (text.length > 400) return { ok: false as const, status: 400, message: "Слишком длинный запрос" };
  return { ok: true as const, value: await askAssistant(place.value, text) };
}

export async function confirmOwnAssistant(token: unknown) {
  const place = await residentPlace();
  if (!place.ok) return place;
  if (typeof token !== "string" || !token) return { ok: false as const, status: 400, message: "Подтверждение не найдено." };
  return { ok: true as const, value: await confirmAssistant(place.value, token) };
}
