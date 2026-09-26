import { formatHumidity, formatMoney, formatTemperature } from "@/lib/format";
import { intentFromPrompt, type AiQuery, type AiToolName } from "@/server/ai-intent";
import { placeFromSession, type Place, type SessionRef } from "@/server/actor";
import { modeForUnit, modesForObject, setUnitMode } from "@/server/life-mode-store";
import { createPass, createRequest, openGate, payOldest } from "@/server/operations";
import { homeSignals, newId, passesForUnit, readOps, writeOps, type Device, type PendingTool } from "@/server/ops-store";
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

const allowedTools = new Set<AiToolName>(["open_gate", "create_pass", "create_request", "pay", "switch_mode", "control_device", "set_temperature"]);
const allowedQueries = new Set<AiQuery>([
  "status",
  "visitors",
  "balance",
  "rooms",
  "devices",
  "device_status",
  "security_status",
  "open_doors",
  "alerts",
  "energy",
]);
const lifeModes = new Set(["HOME", "WORK", "VACATION"]);

const unconfirmed: Proposal = { reply: "Не удалось подтвердить выполнение.", pending: null, query: null };

function unitDevices(place: Place): Device[] {
  return readOps().devices.filter((device) => device.objectId === place.objectId && (device.unitId === place.unitId || device.unitId === null));
}

function pickDevice(place: Place, hint?: string): Device | undefined {
  const devices = unitDevices(place);
  if (hint === "curtain") return devices.find((device) => device.kind === "CURTAIN");
  if (hint === "light") return devices.find((device) => device.kind === "LIGHTING");
  if (hint === "climate") return devices.find((device) => device.kind === "CLIMATE" || device.capabilities?.includes("thermostat"));
  if (hint) {
    const named = devices.find((device) => device.name.toLowerCase().includes(hint) || (device.displayName ?? "").toLowerCase().includes(hint));
    if (named) return named;
  }
  return devices.find((device) => device.kind === "LIGHTING") ?? devices.find((device) => device.kind === "CLIMATE");
}

async function propose(prompt: string, role: Place["role"], place: Place): Promise<Proposal> {
  const endpoint = process.env.STAR_HOME_LLM_URL;
  let suggestion = intentFromPrompt(prompt);
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).catch(() => null);
    const payload = response?.ok
      ? ((await response.json().catch(() => null)) as {
          tool?: string | null;
          query?: string | null;
          mode?: string | null;
          reply?: string;
          command?: string;
          value?: unknown;
        } | null)
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
      command: payload.command ?? suggestion.command,
      value: payload.value ?? suggestion.value,
    };
  }
  if ((suggestion.tool === "pay" || suggestion.query === "balance") && !householdCan(role, "payments.pay")) {
    return { reply: "Оплата доступна только жителю.", pending: null, query: null };
  }
  if (suggestion.tool === "create_pass" && !householdCan(role, "access.pass.create")) return { reply: "Пропуск оформляет житель.", pending: null, query: null };
  if (suggestion.tool === "control_device" || suggestion.tool === "set_temperature") {
    if (!householdCan(role, "devices.command") && !householdCan(role, "access.gate.open")) {
      return { reply: "Нет права управлять устройствами.", pending: null, query: null };
    }
    const device = pickDevice(place, suggestion.tool === "set_temperature" ? "climate" : suggestion.deviceHint);
    if (!device) return { reply: "Нет такого устройства.", pending: null, query: null };
    const pending: PendingTool = {
      name: suggestion.tool,
      token: newId("confirm"),
      deviceId: device.id,
      command: suggestion.command ?? (suggestion.tool === "set_temperature" ? "setTemperature" : "setPower"),
      value: suggestion.value,
    };
    return { reply: suggestion.reply || `Управление «${device.name}». Подтвердите действие.`, pending, query: null };
  }
  if (suggestion.query) return { reply: "", pending: null, query: suggestion.query };
  if (!suggestion.tool) return { reply: "", pending: null, query: null };
  const pending: PendingTool = { name: suggestion.tool, token: newId("confirm") };
  if (suggestion.tool === "switch_mode" && suggestion.mode) pending.mode = suggestion.mode;
  return { reply: suggestion.reply, pending, query: null };
}

function answer(place: Place, query: AiQuery): string {
  const signals = homeSignals(place.unitId, place.objectId);
  const devices = unitDevices(place);
  if (query === "visitors") {
    const passes = passesForUnit(place.unitId);
    if (passes.length === 0) return "Гостей нет.";
    return passes.map((pass) => `${pass.guestName}. ${pass.detail}${pass.vehicle ? `. Автомобиль ${pass.vehicle}` : ""}. Код ${pass.code}.`).join(" ");
  }
  if (query === "balance") {
    if (!signals.balance) return "Открытых счетов нет.";
    return `Открытый счёт ${formatMoney(signals.balance.amount, signals.balance.currency)}.`;
  }
  if (query === "rooms") {
    const names = [...new Set(devices.map((device) => device.displayName ?? device.name).filter(Boolean))];
    const rooms = names.length ? names.join(". ") : "Помещения не добавлены.";
    return rooms;
  }
  if (query === "devices") {
    if (!devices.length) return "Устройств нет.";
    return devices.map((device) => `${device.displayName ?? device.name}: ${device.availability === "OFFLINE" ? "нет связи" : device.work === "FAULT" ? "неисправно" : "на связи"}`).join(". ");
  }
  if (query === "device_status") {
    const climate = devices.find((device) => device.kind === "CLIMATE");
    const reading = climate ? readOps().readings.find((item) => item.deviceId === climate.id) : undefined;
    if (!reading) return "Показаний климата нет.";
    return `Сейчас ${formatTemperature(reading.temperatureC)}. Влажность ${formatHumidity(reading.humidityPercent)}.`;
  }
  if (query === "open_doors") {
    const open = devices.filter((device) => (device.kind === "GATE" || device.kind === "WICKET" || device.kind === "BARRIER" || device.kind === "LOCK") && (device.latch === "OPEN" || device.state?.latch === "OPEN"));
    if (!open.length) return "Открытых дверей и ворот нет.";
    return `Открыто: ${open.map((device) => device.name).join(", ")}.`;
  }
  if (query === "alerts") {
    const faults = devices.filter((device) => device.work === "FAULT" || device.state?.detected);
    const alarms = readOps().alarms.filter((alarm) => alarm.objectId === place.objectId && alarm.status !== "CLOSED");
    if (!faults.length && !alarms.length) return "Активных тревог нет.";
    return [...faults.map((device) => device.name), ...alarms.map((alarm) => alarm.title)].join(". ");
  }
  if (query === "energy") {
    const power = devices.filter((device) => device.kind === "POWER" || device.capabilities?.includes("energy") || device.kind === "LIGHTING");
    if (!power.length) return "Данных по энергии нет.";
    return power.map((device) => `${device.name}: ${device.state?.on === false ? "выкл" : device.state?.on === true ? "вкл" : "нет показаний"}`).join(". ");
  }
  if (query === "security_status") {
    const mode = modesForObject(place.objectId).find((item) => item.mode === modeForUnit(place.unitId));
    const open = devices.filter((device) => (device.kind === "GATE" || device.kind === "WICKET" || device.kind === "BARRIER" || device.kind === "LOCK") && (device.latch === "OPEN" || device.state?.latch === "OPEN"));
    return `${mode?.security ?? "Охрана по режиму дома"}. ${open.length ? `Открыто: ${open.map((device) => device.name).join(", ")}.` : "Точки доступа закрыты."}`;
  }
  const mode = modesForObject(place.objectId).find((item) => item.mode === modeForUnit(place.unitId));
  const climate = signals.climate
    ? `Сейчас ${formatTemperature(signals.climate.temperatureC)}. Влажность ${formatHumidity(signals.climate.humidityPercent)}.`
    : "Показаний климата нет.";
  const categories = signals.categories.length ? ` В доме: ${signals.categories.join(", ")}.` : "";
  return `${climate} Режим «${mode?.label ?? "Дома"}». ${mode?.summary ?? ""}${categories}`;
}

export async function askAssistant(place: Place, prompt: string): Promise<AiReply> {
  const proposal = await propose(prompt, place.role, place);
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

export async function confirmAssistant(place: Place, token: string, session: SessionRef): Promise<AiReply> {
  const file = readOps();
  const turn = file.turns.find((item) => item.userId === place.userId && item.pending?.token === token);
  if (!turn?.pending) return { reply: "Подтверждение не найдено.", confirmToken: null };
  const tool = turn.pending.name;
  const mode = turn.pending.mode;
  const deviceId = turn.pending.deviceId;
  const command = turn.pending.command;
  const value = turn.pending.value;
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
  if ((tool === "control_device" || tool === "set_temperature") && deviceId && command) {
    const { commandDeviceSmart } = await import("@/server/smart-home");
    const first = await commandDeviceSmart(session, { deviceId, command, value });
    if (first.ok && first.value.needsConfirm && first.value.token) {
      const second = await commandDeviceSmart(session, { deviceId, command, value, confirmToken: first.value.token });
      reply = second.ok ? second.value.message : second.message;
    } else {
      reply = first.ok ? first.value.message : first.message;
    }
  }
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
  return { ok: true as const, value: await confirmAssistant(place.value, token, session as SessionRef) };
}
