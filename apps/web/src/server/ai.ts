import { formatHumidity, formatMoney, formatTemperature } from "@/lib/format";
import { intentFromPrompt, type AiQuery, type AiToolName } from "@/server/ai-intent";
import { placeFromSession, type Place, type SessionRef } from "@/server/actor";
import { modeForUnit, modesForObject, setUnitMode } from "@/server/life-mode-store";
import { createPass, createRequest, openGate, payOldest } from "@/server/operations";
import { homeSignals, newId, passesForUnit, readOps, writeOps, type PendingTool } from "@/server/ops-store";
import { householdCan } from "@/server/rbac/policy";

export type AiReply = {
  reply: string;
  confirmToken: string | null;
};

type Proposal = {
  reply: string;
  pending: PendingTool | null;
  query: AiQuery | null;
};

const allowedTools = new Set<AiToolName>(["open_gate", "create_pass", "create_request", "pay", "switch_mode"]);
const allowedQueries = new Set<AiQuery>(["status", "visitors", "balance"]);
const lifeModes = new Set(["HOME", "WORK", "VACATION"]);

const unconfirmed: Proposal = { reply: "Не удалось подтвердить выполнение.", pending: null, query: null };

async function propose(prompt: string, role: Place["role"]): Promise<Proposal> {
  const endpoint = process.env.STAR_HOME_LLM_URL;
  let suggestion = intentFromPrompt(prompt);
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).catch(() => null);
    const payload = response?.ok
      ? ((await response.json().catch(() => null)) as { tool?: string | null; query?: string | null; mode?: string | null; reply?: string } | null)
      : null;
    const tool = payload?.tool ?? null;
    const query = payload?.query ?? null;
    const mode = payload?.mode ?? null;
    if (!payload || (tool && !allowedTools.has(tool as AiToolName)) || (query && !allowedQueries.has(query as AiQuery))) return unconfirmed;
    if (tool === "switch_mode" && !lifeModes.has(mode ?? "")) return unconfirmed;
    suggestion = {
      tool: (tool as AiToolName | null) ?? null,
      query: tool ? null : ((query as AiQuery | null) ?? null),
      mode: tool === "switch_mode" ? (mode as "HOME" | "WORK" | "VACATION") : null,
      reply: payload.reply || "",
    };
  }
  if ((suggestion.tool === "pay" || suggestion.query === "balance") && !householdCan(role, "payments.pay")) {
    return { reply: "Оплата доступна только жителю.", pending: null, query: null };
  }
  if (suggestion.tool === "create_pass" && !householdCan(role, "access.pass.create")) return { reply: "Пропуск оформляет житель.", pending: null, query: null };
  if (suggestion.query) return { reply: "", pending: null, query: suggestion.query };
  if (!suggestion.tool) return { reply: "", pending: null, query: null };
  const pending: PendingTool = { name: suggestion.tool, token: newId("confirm") };
  if (suggestion.tool === "switch_mode" && suggestion.mode) pending.mode = suggestion.mode;
  return { reply: suggestion.reply, pending, query: null };
}

function answer(place: Place, query: AiQuery): string {
  const signals = homeSignals(place.unitId, place.objectId);
  if (query === "visitors") {
    const passes = passesForUnit(place.unitId);
    if (passes.length === 0) return "Гостей нет.";
    return passes.map((pass) => `${pass.guestName}. ${pass.detail}${pass.vehicle ? `. Автомобиль ${pass.vehicle}` : ""}. Код ${pass.code}.`).join(" ");
  }
  if (query === "balance") {
    if (!signals.balance) return "Открытых счетов нет.";
    return `Открытый счёт ${formatMoney(signals.balance.amount, signals.balance.currency)}.`;
  }
  const mode = modesForObject(place.objectId).find((item) => item.mode === modeForUnit(place.unitId));
  const climate = signals.climate
    ? `Сейчас ${formatTemperature(signals.climate.temperatureC)}. Влажность ${formatHumidity(signals.climate.humidityPercent)}.`
    : "Показаний климата нет.";
  const categories = signals.categories.length ? ` В доме: ${signals.categories.join(", ")}.` : "";
  return `${climate} Режим «${mode?.label ?? "Дома"}». ${mode?.summary ?? ""}${categories}`;
}

export async function askAssistant(place: Place, prompt: string): Promise<AiReply> {
  const proposal = await propose(prompt, place.role);
  if (!proposal.pending) {
    const signals = homeSignals(place.unitId, place.objectId);
    const mode = modesForObject(place.objectId).find((item) => item.mode === modeForUnit(place.unitId));
    const temperature = signals.climate ? formatTemperature(signals.climate.temperatureC) : "нет данных";
    const reply = proposal.query
      ? answer(place, proposal.query)
      : proposal.reply || `Сейчас ${temperature}. Режим «${mode?.label ?? modeForUnit(place.unitId)}». Могу открыть ворота, оформить пропуск, создать заявку или оплатить счёт.`;
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
  const mode = turn.pending.mode;
  turn.pending = null;
  writeOps(file);
  let reply = "Не удалось подтвердить выполнение.";
  if (tool === "open_gate" && householdCan(place.role, "access.gate.open")) reply = (await openGate(place)).message;
  if (tool === "switch_mode" && mode && householdCan(place.role, "home.mode.switch")) {
    setUnitMode(place.unitId, mode);
    const label = modesForObject(place.objectId).find((item) => item.mode === mode)?.label ?? mode;
    reply = `Режим «${label}» включён.`;
  }
  if (tool === "create_pass" && householdCan(place.role, "access.pass.create")) {
    createPass(place, "Гость", "По запросу в чате");
    reply = "Пропуск оформлен.";
  }
  if (tool === "create_request" && householdCan(place.role, "service.create")) {
    createRequest(place, "Другое", turn.prompt);
    reply = "Заявка создана.";
  }
  if (tool === "pay" && householdCan(place.role, "payments.pay")) reply = (await payOldest(place)).message;
  const next = readOps();
  const saved = next.turns.find((item) => item.id === turn.id);
  if (saved) saved.reply = reply;
  writeOps(next);
  return { reply, confirmToken: null };
}

export async function askFor(session: SessionRef | null, prompt: unknown) {
  const place = placeFromSession(session, "ai.use");
  if (!place.ok) return place;
  const text = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (!text) return { ok: false as const, status: 400, message: "Напишите запрос" };
  if (text.length > 400) return { ok: false as const, status: 400, message: "Слишком длинный запрос" };
  return { ok: true as const, value: await askAssistant(place.value, text) };
}

export async function confirmFor(session: SessionRef | null, token: unknown) {
  const place = placeFromSession(session, "ai.use");
  if (!place.ok) return place;
  if (typeof token !== "string" || !token) return { ok: false as const, status: 400, message: "Подтверждение не найдено." };
  return { ok: true as const, value: await confirmAssistant(place.value, token) };
}
