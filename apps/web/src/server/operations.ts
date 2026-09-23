import { adminObjectFrom, placeFromSession, residentPlace, type Place, type SessionRef } from "@/server/actor";
import { publishLive, pushNotice } from "@/server/store-bind";
import { accessPoint, gateFor, runDevice } from "@/server/devices";
import { paymentProvider } from "@/server/payments";
import {
  clock,
  newId,
  readOps,
  writeOps,
  type AuditEntry,
  type Device,
  type Pass,
  type RequestStatus,
  type ServiceRequest,
} from "@/server/ops-store";

export type { Place };

async function currentSession(): Promise<SessionRef | null> {
  const { readSession } = await import("@/server/session");
  return readSession();
}

function audit(entry: Omit<AuditEntry, "id" | "at">): void {
  const file = readOps();
  file.audit.unshift({ ...entry, id: newId("audit"), at: clock() });
  writeOps(file);
}

export function recordAudit(entry: Omit<AuditEntry, "id" | "at">): void {
  audit(entry);
}

async function openDevice(place: Place, device: Device | null): Promise<{ confirmed: boolean; message: string }> {
  const result = device ? await runDevice(device, "OPEN") : { confirmed: false };
  const gate = device?.kind === "GATE";
  const message = result.confirmed ? (gate ? "Ворота открыты." : `${device?.name ?? "Точка"}: открыто.`) : "Не удалось подтвердить выполнение.";
  const file = readOps();
  file.events.unshift({
    id: newId("evt"),
    companyId: place.companyId,
    objectId: place.objectId,
    unitId: place.unitId || null,
    time: clock(),
    title: result.confirmed ? (gate ? "Ворота открыты" : device?.name ?? "Точка доступа") : "Команда не подтверждена",
    result: result.confirmed ? "SUCCESS" : "UNCONFIRMED",
  });
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    action: "OPEN_GATE",
    target: device?.name ?? "Ворота",
    result: result.confirmed ? "SUCCESS" : "ERROR",
    error: result.confirmed ? "" : "Нет подтверждения адаптера",
  });
  publishLive({ objectId: place.objectId, kind: "access", title: message.replace(/\.$/, "") });
  return { confirmed: result.confirmed, message };
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
    action: "CREATE_PASS",
    target: guestName,
    result: "SUCCESS",
    error: "",
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
    action: "CREATE_REQUEST",
    target: category,
    result: "SUCCESS",
    error: "",
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
  request.status = status;
  writeOps(file);
  audit({
    actorUserId,
    companyId,
    objectId,
    action: "UPDATE_REQUEST",
    target: request.category,
    result: "SUCCESS",
    error: "",
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
      action: "PAY_INVOICE",
      target: invoice.title,
      result: "ERROR",
      error: "Провайдер не подтвердил оплату",
    });
    return { confirmed: false, message: "Не удалось подтвердить выполнение." };
  }
  invoice.status = "PAID";
  writeOps(file);
  audit({
    actorUserId: place.userId,
    companyId: place.companyId,
    objectId: place.objectId,
    action: "PAY_INVOICE",
    target: invoice.title,
    result: "SUCCESS",
    error: "",
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
    action: "RAISE_ALARM",
    target: "Охрана",
    result: "SUCCESS",
    error: "",
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

export async function openGateFor(session: SessionRef | null) {
  const place = placeFromSession(session);
  if (!place.ok) return place;
  return { ok: true as const, value: await openGate(place.value) };
}

export async function openOwnGate(): Promise<{ ok: true; value: { confirmed: boolean; message: string } } | { ok: false; status: number; message: string }> {
  const place = await residentPlace();
  if (!place.ok) return place;
  return { ok: true, value: await openGate(place.value) };
}

export async function openObjectGateFor(session: SessionRef | null, objectId: unknown) {
  if (typeof objectId !== "string") return { ok: false as const, status: 400, message: "Выберите объект" };
  const admin = adminObjectFrom(session, objectId);
  if (!admin.ok) return admin;
  return {
    ok: true as const,
    value: await openGate({
      userId: admin.value.userId,
      companyId: admin.value.companyId,
      objectId: admin.value.objectId,
      unitId: "",
      role: "COMPANY_ADMIN",
    }),
  };
}

export async function openObjectGate(objectId: unknown) {
  return openObjectGateFor(await currentSession(), objectId);
}

export async function cameraFrameFor(session: SessionRef | null, objectId: unknown, name: unknown) {
  if (typeof objectId !== "string" || typeof name !== "string" || !name.trim()) {
    return { ok: false as const, status: 400, message: "Камера не найдена" };
  }
  const admin = adminObjectFrom(session, objectId);
  if (!admin.ok) return admin;
  const device = readOps().devices.find(
    (item) => item.objectId === admin.value.objectId && item.companyId === admin.value.companyId && item.kind === "CAMERA" && item.name === name.trim(),
  );
  if (!device) return { ok: false as const, status: 404, message: "Камера не найдена" };
  const result = await runDevice(device, "READ");
  return {
    ok: true as const,
    value: { confirmed: result.confirmed, message: result.confirmed ? "Кадр получен." : "Не удалось подтвердить выполнение." },
  };
}

export async function openPointFor(session: SessionRef | null, pointId: unknown) {
  const place = placeFromSession(session);
  if (!place.ok) return place;
  if (typeof pointId !== "string" || !pointId) return { ok: false as const, status: 400, message: "Точка доступа не найдена" };
  return { ok: true as const, value: await openAccessPoint(place.value, pointId) };
}

export async function addPassFor(session: SessionRef | null, guestName: unknown, detail: unknown, vehicle?: unknown) {
  const place = placeFromSession(session, new Set(["RESIDENT"]));
  if (!place.ok) return place;
  const name = clean(guestName, "Введите имя гостя", 80);
  if (typeof name !== "string") return name;
  const note = clean(detail, "Введите срок или комментарий", 160);
  if (typeof note !== "string") return note;
  const car = typeof vehicle === "string" ? vehicle.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  return { ok: true as const, value: createPass(place.value, name, note, car) };
}

export async function addOwnPass(guestName: unknown, detail: unknown) {
  const place = placeFromSession(await currentSession(), new Set(["RESIDENT"]));
  if (!place.ok) return place;
  const name = clean(guestName, "Введите имя гостя", 80);
  if (typeof name !== "string") return name;
  const note = clean(detail, "Введите срок или комментарий", 160);
  if (typeof note !== "string") return note;
  return { ok: true as const, value: createPass(place.value, name, note) };
}

export async function addRequestFor(session: SessionRef | null, category: unknown, text: unknown, fileName?: string) {
  const place = placeFromSession(session);
  if (!place.ok) return place;
  const kind = clean(category, "Выберите тему", 40);
  if (typeof kind !== "string") return kind;
  const body = clean(text, "Опишите заявку", 400);
  if (typeof body !== "string") return body;
  return { ok: true as const, value: createRequest(place.value, kind, body, fileName) };
}

export async function addOwnRequest(category: unknown, text: unknown) {
  const place = await residentPlace();
  if (!place.ok) return place;
  const kind = clean(category, "Выберите тему", 40);
  if (typeof kind !== "string") return kind;
  const body = clean(text, "Опишите заявку", 400);
  if (typeof body !== "string") return body;
  return { ok: true as const, value: createRequest(place.value, kind, body) };
}

const statuses = new Set<RequestStatus>(["CREATED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "WAITING", "DONE", "CLOSED"]);

export async function setRequestStatusFor(session: SessionRef | null, requestId: string, status: unknown, objectId: unknown) {
  if (typeof objectId !== "string") return { ok: false as const, status: 400, message: "Выберите объект" };
  const admin = adminObjectFrom(session, objectId);
  if (!admin.ok) return admin;
  if (typeof status !== "string" || !statuses.has(status as RequestStatus)) {
    return { ok: false as const, status: 400, message: "Неизвестный статус" };
  }
  const request = updateRequestStatus(admin.value.userId, admin.value.companyId, admin.value.objectId, requestId, status as RequestStatus);
  if (!request) return { ok: false as const, status: 404, message: "Заявка не найдена" };
  return { ok: true as const, value: request };
}

export async function setRequestStatus(requestId: string, status: unknown, objectId: unknown) {
  return setRequestStatusFor(await currentSession(), requestId, status, objectId);
}

export async function payFor(session: SessionRef | null) {
  const place = placeFromSession(session, new Set(["RESIDENT"]));
  if (!place.ok) return place;
  return { ok: true as const, value: await payOldest(place.value) };
}

export async function payOwnInvoice() {
  const place = placeFromSession(await currentSession(), new Set(["RESIDENT"]));
  if (!place.ok) return place;
  return { ok: true as const, value: await payOldest(place.value) };
}

export async function alarmFor(session: SessionRef | null) {
  const place = placeFromSession(session);
  if (!place.ok) return place;
  return { ok: true as const, value: raiseAlarm(place.value) };
}

export async function callOwnSecurity() {
  const place = await residentPlace();
  if (!place.ok) return place;
  return { ok: true as const, value: raiseAlarm(place.value) };
}
