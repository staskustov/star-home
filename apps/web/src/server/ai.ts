import { residentPlace, type Place } from "@/server/actor";
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

function propose(prompt: string): Proposal {
  const text = prompt.toLowerCase();
  if (text.includes("ворот")) {
    const token = newId("confirm");
    return { reply: "Открыть ворота? Подтвердите действие.", pending: { name: "open_gate", token } };
  }
  if (text.includes("пропуск") || text.includes("гость")) {
    const token = newId("confirm");
    return { reply: "Оформить пропуск для гостя? Подтвердите действие.", pending: { name: "create_pass", token } };
  }
  if (text.includes("заяв")) {
    const token = newId("confirm");
    return { reply: "Создать заявку? Подтвердите действие.", pending: { name: "create_request", token } };
  }
  if (text.includes("оплат")) {
    const token = newId("confirm");
    return { reply: "Оплатить открытый счёт? Подтвердите действие.", pending: { name: "pay", token } };
  }
  return { reply: "", pending: null };
}

export function askAssistant(place: Place, prompt: string): AiReply {
  const proposal = propose(prompt);
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
  if (tool === "create_pass") {
    createPass(place, "Гость", "По запросу в чате");
    reply = "Пропуск оформлен.";
  }
  if (tool === "create_request") {
    createRequest(place, "Другое", turn.prompt);
    reply = "Заявка создана.";
  }
  if (tool === "pay") reply = (await payOldest(place)).message;
  const next = readOps();
  const saved = next.turns.find((item) => item.id === turn.id);
  if (saved) saved.reply = reply;
  writeOps(next);
  return { reply, confirmToken: null };
}

export async function askOwnAssistant(prompt: unknown) {
  const place = await residentPlace();
  if (!place.ok) return place;
  const text = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (!text) return { ok: false as const, status: 400, message: "Напишите запрос" };
  if (text.length > 400) return { ok: false as const, status: 400, message: "Слишком длинный запрос" };
  return { ok: true as const, value: askAssistant(place.value, text) };
}

export async function confirmOwnAssistant(token: unknown) {
  const place = await residentPlace();
  if (!place.ok) return place;
  if (typeof token !== "string" || !token) return { ok: false as const, status: 400, message: "Подтверждение не найдено." };
  return { ok: true as const, value: await confirmAssistant(place.value, token) };
}
