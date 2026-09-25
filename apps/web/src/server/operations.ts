import { placeFromSession, type Place, type SessionRef } from "@/server/actor";
import { can, objectFor, reaches, type StaffActor } from "@/server/rbac/decide";
import { appendAudit, type AuditInput } from "@/server/audit-store";
import { publishLive, pushNotice } from "@/server/store-bind";
import { accessPoint, gateFor, runDevice } from "@/server/devices";
import { paymentProvider } from "@/server/payments";
import {
  clock,
  newId,
  readOps,
  writeOps,
  type Device,
  type Pass,
  type RequestStatus,
  type ServiceRequest,
} from "@/server/ops-store";

export type { Place };

function audit(entry: AuditInput): void {
  appendAudit(entry);
}

export function recordAudit(entry: AuditInput): void {
  appendAudit(entry);
}

async function commandDevice(place: Place, device: Device | null, command: "OPEN" | "CLOSE"): Promise<{ confirmed: boolean; message: string }> {
  const result = device ? await runDevice(device, command) : { confirmed: false };
  const opening = command === "OPEN";
  const gate = device?.kind === "GATE";
  const done = opening
    ? gate
      ? "Ворота открыты."
      : `${device?.name ?? "Точка"}: открыто.`
    : gate
      ? "Ворота закрыты."
      : `${device?.name ?? "Точка"}: закрыто.`;
  const message = result.confirmed ? done : "Не удалось подтвердить выполнение.";
  const file = readOps();
  if (result.confirmed && device) {
    const current = file.devices.find((item) => item.id === device.id);
    if (current) current.latch = opening ? "OPEN" : "CLOSED";
  }
  file.events.unshift({
    id: newId("evt"),
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId || null,
    time: clock(),
    title: result.confirmed
      ? opening
        ? gate
          ? "Ворота открыты"
          : device?.name ?? "Точка доступа"
        : gate
          ? "Ворота закрыты"
          : `${device?.name ?? "Точка доступа"}: закрыто`
      : "Команда не подтверждена",
    result: result.confirmed ? "SUCCESS" : "UNCONFIRMED",
  });
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId || null,
    action: opening ? "OPEN_GATE" : "CLOSE_GATE",
    targetType: "device",
    targetId: device?.id ?? null,
    target: device?.name ?? "Ворота",
    result: result.confirmed ? "SUCCESS" : "ERROR",
    reason: result.confirmed ? "" : "Нет подтверждения адаптера",
  });
  publishLive({ objectId: place.objectId, kind: "access", title: message.replace(/\.$/, "") });
  return { confirmed: result.confirmed, message };
}

async function openDevice(place: Place, device: Device | null): Promise<{ confirmed: boolean; message: string }> {
  return commandDevice(place, device, "OPEN");
}

async function closeDevice(place: Place, device: Device | null): Promise<{ confirmed: boolean; message: string }> {
  return commandDevice(place, device, "CLOSE");
}

export async function openGate(place: Place): Promise<{ confirmed: boolean; message: string }> {
  return openDevice(place, gateFor(place.objectId, place.unitId));
}

export async function openAccessPoint(place: Place, pointId: string): Promise<{ confirmed: boolean; message: string }> {
  return openDevice(place, accessPoint(place.objectId, place.unitId, pointId));
}

export function createPass(place: Place, guestName: string, detail: string, vehicle = ""): Pass {
  const file = readOps();
  const pass: Pass = {
    id: newId("pass"),
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    guestName,
    detail,
    vehicle,
    code: newId("code").slice(-8).toUpperCase(),
  };
  file.passes.unshift(pass);
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    action: "CREATE_PASS",
    targetType: "pass",
    targetId: pass.id,
    target: guestName,
  });
  return pass;
}

export function createRequest(place: Place, category: string, text: string, fileName?: string): ServiceRequest {
  const file = readOps();
  const request: ServiceRequest = {
    id: newId("req"),
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    authorUserId: place.userId,
    category,
    text,
    status: "CREATED",
    fileName,
  };
  file.requests.unshift(request);
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    action: "CREATE_REQUEST",
    targetType: "request",
    targetId: request.id,
    target: category,
  });
  return request;
}

export function updateRequestStatus(
  actorUserId: string,
  companyId: string,
  objectId: string,
  requestId: string,
  status: RequestStatus,
): ServiceRequest | null {
  const file = readOps();
  const request = file.requests.find((item) => item.id === requestId && item.companyId === companyId && item.objectId === objectId);
  if (!request) return null;
  const before = request.status;
  request.status = status;
  writeOps(file);
  audit({
    actorUserId,
    companyId,
    objectId,
    unitId: request.unitId,
    action: "UPDATE_REQUEST",
    targetType: "request",
    targetId: request.id,
    target: request.category,
    changes: [{ field: "status", from: before, to: status }],
  });
  return request;
}

export async function payOldest(place: Place): Promise<{ confirmed: boolean; message: string }> {
  const file = readOps();
  const invoice = file.invoices.find((item) => item.unitId === place.unitId && item.status === "OPEN");
  if (!invoice) return { confirmed: false, message: "Открытых счетов нет." };
  const payment = await paymentProvider().pay(invoice);
  if (!payment.confirmed) {
    audit({
      actorUserId: place.userId,
      companyId: place.companyId,
      objectId: place.objectId,
      unitId: place.unitId,
      action: "PAY_INVOICE",
      targetType: "invoice",
      targetId: invoice.id,
      target: `${invoice.title} · ${invoice.amount} ${invoice.currency}`,
      result: "ERROR",
      reason: "Провайдер не подтвердил оплату",
    });
    return { confirmed: false, message: "Не удалось подтвердить выполнение." };
  }
  invoice.status = "PAID";
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    action: "PAY_INVOICE",
    targetType: "invoice",
    targetId: invoice.id,
    target: `${invoice.title} · ${invoice.amount} ${invoice.currency}`,
  });
  return { confirmed: true, message: "Счёт оплачен." };
}

export function raiseAlarm(place: Place): { message: string } {
  const file = readOps();
  file.alarms.unshift({
    id: newId("alarm"),
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    title: "Вызов охраны",
    status: "OPEN",
    at: clock(),
  });
  file.notices.unshift({
    id: newId("note"),
    companyId: place.companyId,
    userId: place.userId,
    title: "Охрана",
    body: "Вызов принят и записан.",
    at: clock(),
  });
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId,
    action: "RAISE_ALARM",
    targetType: "alarm",
    target: "Охрана",
  });
  publishLive({ objectId: place.objectId, kind: "alarm", title: "Вызов охраны" });
  pushNotice(place.userId, "Вызов принят и записан.");
  return { message: "Вызов передан охране." };
}

function clean(value: unknown, empty: string, limit: number): string | { ok: false; status: number; message: string } {
  if (typeof value !== "string") return { ok: false, status: 400, message: empty };
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, status: 400, message: empty };
  if (text.length > limit) return { ok: false, status: 400, message: "Слишком длинный текст" };
  return text;
}

const denied = { ok: false as const, status: 403, message: "Нет доступа" };

export async function openGateFor(session: SessionRef | null) {
  const place = placeFromSession(session, "access.gate.open");
  if (!place.ok) return place;
  return { ok: true as const, value: await openGate(place.value) };
}

export async function openObjectGateFor(actor: StaffActor, objectId: unknown) {
  if (!can(actor, "access.gate.open")) return denied;
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  return {
    ok: true as const,
    value: await openGate({ userId: actor.userId, companyId: object.value.companyId, objectId: object.value.id, unitId: "", role: actor.role }),
  };
}

async function commandObjectPointFor(actor: StaffActor, objectId: unknown, pointId: unknown, command: "OPEN" | "CLOSE") {
  if (!can(actor, "access.gate.open")) return denied;
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  if (typeof pointId !== "string" || !pointId) return { ok: false as const, status: 400, message: "Точка доступа не найдена" };
  const device = accessPoint(object.value.id, "", pointId);
  if (!device || device.companyId !== object.value.companyId) return { ok: false as const, status: 404, message: "Точка доступа не найдена" };
  if (!reaches(actor, device)) return denied;
  if (device.work === "FAULT" || device.work === "OFF") return { ok: false as const, status: 409, message: "Точка доступа не в работе" };
  const run = command === "OPEN" ? openDevice : closeDevice;
  return {
    ok: true as const,
    value: await run({ userId: actor.userId, companyId: object.value.companyId, objectId: object.value.id, unitId: "", role: actor.role }, device),
  };
}

export async function openObjectPointFor(actor: StaffActor, objectId: unknown, pointId: unknown) {
  return commandObjectPointFor(actor, objectId, pointId, "OPEN");
}

export async function closeObjectPointFor(actor: StaffActor, objectId: unknown, pointId: unknown) {
  return commandObjectPointFor(actor, objectId, pointId, "CLOSE");
}

export async function cameraFrameFor(actor: StaffActor, objectId: unknown, deviceId: unknown) {
  if (!can(actor, "security.camera.view")) return denied;
  if (typeof deviceId !== "string" || !deviceId) return { ok: false as const, status: 400, message: "Камера не найдена" };
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  const device = readOps().devices.find(
    (item) => item.id === deviceId && item.objectId === object.value.id && item.companyId === object.value.companyId && item.kind === "CAMERA",
  );
  if (!device) return { ok: false as const, status: 404, message: "Камера не найдена" };
  if (!reaches(actor, device)) return denied;
  if (device.work === "OFF" || device.work === "FAULT") {
    return { ok: false as const, status: 409, message: device.work === "OFF" ? "Камера выведена из работы" : "Камера неисправна" };
  }
  const result = await runDevice(device, "READ");
  audit({
    actorUserId: actor.userId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "CAMERA_VIEW",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    result: result.confirmed ? "SUCCESS" : "ERROR",
    reason: result.confirmed ? "" : "Нет подтверждения адаптера",
  });
  return {
    ok: true as const,
    value: { confirmed: result.confirmed, message: result.confirmed ? "Кадр получен." : "Не удалось подтвердить выполнение." },
  };
}

export async function openPointFor(session: SessionRef | null, pointId: unknown) {
  const place = placeFromSession(session, "access.gate.open");
  if (!place.ok) return place;
  if (typeof pointId !== "string" || !pointId) return { ok: false as const, status: 400, message: "Точка доступа не найдена" };
  return { ok: true as const, value: await openAccessPoint(place.value, pointId) };
}

export async function addPassFor(session: SessionRef | null, guestName: unknown, detail: unknown, vehicle?: unknown) {
  const place = placeFromSession(session, "access.pass.create");
  if (!place.ok) return place;
  const name = clean(guestName, "Введите имя гостя", 80);
  if (typeof name !== "string") return name;
  const note = clean(detail, "Введите срок или комментарий", 160);
  if (typeof note !== "string") return note;
  const car = typeof vehicle === "string" ? vehicle.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  return { ok: true as const, value: createPass(place.value, name, note, car) };
}

export async function addRequestFor(session: SessionRef | null, category: unknown, text: unknown, fileName?: string) {
  const place = placeFromSession(session, "service.create");
  if (!place.ok) return place;
  const kind = clean(category, "Выберите тему", 40);
  if (typeof kind !== "string") return kind;
  const body = clean(text, "Опишите заявку", 400);
  if (typeof body !== "string") return body;
  return { ok: true as const, value: createRequest(place.value, kind, body, fileName) };
}

const statuses = new Set<RequestStatus>(["CREATED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "WAITING", "DONE", "CLOSED"]);

export async function setRequestStatusFor(actor: StaffActor, requestId: unknown, status: unknown, objectId: unknown) {
  if (!can(actor, "service.edit")) return denied;
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  if (typeof requestId !== "string" || !requestId) return { ok: false as const, status: 404, message: "Заявка не найдена" };
  if (typeof status !== "string" || !statuses.has(status as RequestStatus)) {
    return { ok: false as const, status: 400, message: "Неизвестный статус" };
  }
  const current = readOps().requests.find((item) => item.id === requestId && item.companyId === object.value.companyId && item.objectId === object.value.id);
  if (!current) return { ok: false as const, status: 404, message: "Заявка не найдена" };
  if (!reaches(actor, current)) return denied;
  const request = updateRequestStatus(actor.userId, object.value.companyId, object.value.id, requestId, status as RequestStatus);
  if (!request) return { ok: false as const, status: 404, message: "Заявка не найдена" };
  return { ok: true as const, value: request };
}

export async function payFor(session: SessionRef | null) {
  const place = placeFromSession(session, "payments.pay");
  if (!place.ok) return place;
  return { ok: true as const, value: await payOldest(place.value) };
}

export async function alarmFor(session: SessionRef | null) {
  const place = placeFromSession(session, "security.alarm.raise");
  if (!place.ok) return place;
  return { ok: true as const, value: raiseAlarm(place.value) };
}

