import { placeFromSession, type SessionRef } from "@/server/actor";
import { findBuilding, findObject, findUnit } from "@/server/catalog-store";
import { findUserById } from "@/server/directory";
import { recordAudit } from "@/server/operations";
import { clock, newId, readOps, writeOps, type SecurityChatMessage } from "@/server/ops-store";
import { listMemberships } from "@/server/people-store";
import { can, objectFor, reaches, type StaffActor } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import { publishLive, pushNotice } from "@/server/store-bind";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

export type SecurityDeskView = {
  objectName: string;
  placeName: string;
  phone: string | null;
  canCall: boolean;
  canChat: boolean;
  canSos: boolean;
  messages: SecurityChatRow[];
};

export type SecurityChatRow = {
  id: string;
  unitId: string;
  place: string;
  actorName: string;
  role: string;
  body: string;
  at: string;
  mine: boolean;
};

function placeLabel(unitId: string | null | undefined): string {
  if (!unitId) return "Общая территория";
  const unit = findUnit(unitId);
  if (!unit) return "Единица";
  const building = unit.buildingId ? findBuilding(unit.buildingId)?.name : undefined;
  return building ? `${building} · ${unit.name}` : unit.name;
}

function callerName(userId: string): string {
  return findUserById(userId)?.name?.trim() || "Житель";
}

const postRoles = new Set(["SUPER_ADMIN", "COMPANY_ADMIN", "OBJECT_ADMIN", "MANAGER", "SECURITY"]);

function pushSecurityStaff(companyId: string, objectId: string, title: string, body: string): void {
  const ids = new Set(
    listMemberships()
      .filter(
        (membership) =>
          membership.companyId === companyId &&
          membership.status !== "REVOKED" &&
          postRoles.has(membership.role) &&
          (membership.objectId === null || membership.objectId === objectId),
      )
      .map((membership) => membership.userId),
  );
  for (const userId of ids) pushNotice(userId, body, title);
}

function asRow(message: SecurityChatMessage, viewerId: string): SecurityChatRow {
  return {
    id: message.id,
    unitId: message.unitId,
    place: placeLabel(message.unitId),
    actorName: message.actorName,
    role: message.role,
    body: message.body,
    at: message.at,
    mine: message.actorUserId === viewerId,
  };
}

function cleanBody(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите сообщение" };
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, status: 400, message: "Введите сообщение" };
  if (text.length > 400) return { ok: false, status: 400, message: "Слишком длинный текст" };
  return text;
}

export function securityDeskFor(session: SessionRef | null): Success<SecurityDeskView> | Failure {
  const place = placeFromSession(session, "home.view");
  if (!place.ok) return place;
  const object = findObject(place.value.objectId);
  if (!object) return { ok: false, status: 404, message: "Объект не найден" };
  const canRaise = householdCan(place.value.role, "security.alarm.raise");
  const file = readOps();
  const messages = canRaise
    ? (file.chats ?? [])
        .filter((item) => item.objectId === place.value.objectId && item.unitId === place.value.unitId)
        .slice(-80)
        .map((item) => asRow(item, place.value.userId))
    : [];
  const phone = object.securityPhone?.trim() || null;
  return {
    ok: true,
    value: {
      objectName: object.name,
      placeName: placeLabel(place.value.unitId),
      phone,
      canCall: Boolean(phone),
      canChat: canRaise,
      canSos: canRaise,
      messages,
    },
  };
}

export function sendSecurityMessageFor(session: SessionRef | null, body: unknown): Success<{ id: string }> | Failure {
  const place = placeFromSession(session, "security.alarm.raise");
  if (!place.ok) return place;
  const text = cleanBody(body);
  if (typeof text !== "string") return text;
  const file = readOps();
  file.chats ??= [];
  const message: SecurityChatMessage = {
    id: newId("chat"),
    companyId: place.value.companyId,
    objectId: place.value.objectId,
    unitId: place.value.unitId,
    actorUserId: place.value.userId,
    actorName: callerName(place.value.userId),
    role: place.value.role,
    body: text,
    at: clock(),
  };
  file.chats.push(message);
  file.chats = file.chats.slice(-500);
  writeOps(file);
  recordAudit({
    actorUserId: place.value.userId,
    companyId: place.value.companyId,
    objectId: place.value.objectId,
    unitId: place.value.unitId,
    action: "SECURITY_CHAT",
    targetType: "chat",
    targetId: message.id,
    target: text,
  });
  publishLive({ objectId: place.value.objectId, kind: "chat", title: "Сообщение охране" });
  pushSecurityStaff(place.value.companyId, place.value.objectId, "Охрана", `${callerName(place.value.userId)} · ${placeLabel(place.value.unitId)}: ${text}`);
  return { ok: true, value: { id: message.id } };
}

export function raiseSosFor(session: SessionRef | null): Success<{ message: string }> | Failure {
  const place = placeFromSession(session, "security.alarm.raise");
  if (!place.ok) return place;
  const name = callerName(place.value.userId);
  const house = placeLabel(place.value.unitId);
  const object = findObject(place.value.objectId);
  const file = readOps();
  file.alarms.unshift({
    id: newId("alarm"),
    companyId: place.value.companyId,
    objectId: place.value.objectId,
    unitId: place.value.unitId,
    title: "SOS · ЧП",
    status: "OPEN",
    at: clock(),
    kind: "SOS",
    callerUserId: place.value.userId,
    callerName: name,
  });
  file.notices.unshift({
    id: newId("note"),
    companyId: place.value.companyId,
    userId: place.value.userId,
    title: "SOS",
    body: "Сигнал передан на пост охраны.",
    at: clock(),
  });
  writeOps(file);
  recordAudit({
    actorUserId: place.value.userId,
    companyId: place.value.companyId,
    objectId: place.value.objectId,
    unitId: place.value.unitId,
    action: "RAISE_SOS",
    targetType: "alarm",
    target: `${name} · ${house}`,
  });
  publishLive({ objectId: place.value.objectId, kind: "sos", title: "SOS" });
  pushNotice(place.value.userId, "Сигнал передан на пост охраны.", "SOS");
  pushSecurityStaff(
    place.value.companyId,
    place.value.objectId,
    "SOS",
    `${name}, ${object?.name ?? "объект"} · ${house}`,
  );
  return { ok: true, value: { message: "Сигнал передан на пост охраны." } };
}

export function sendSecurityReplyFor(actor: StaffActor, input: { objectId?: unknown; unitId?: unknown; body?: unknown }): Success<{ id: string }> | Failure {
  if (!can(actor, "security.view")) return denied;
  const object = objectFor(actor, input.objectId);
  if (!object.ok) return object;
  if (typeof input.unitId !== "string" || !input.unitId) return { ok: false, status: 400, message: "Выберите дом" };
  if (!reaches(actor, { companyId: object.value.companyId, objectId: object.value.id, unitId: input.unitId })) return denied;
  const text = cleanBody(input.body);
  if (typeof text !== "string") return text;
  const file = readOps();
  file.chats ??= [];
  const message: SecurityChatMessage = {
    id: newId("chat"),
    companyId: object.value.companyId,
    objectId: object.value.id,
    unitId: input.unitId,
    actorUserId: actor.userId,
    actorName: callerName(actor.userId),
    role: actor.role,
    body: text,
    at: clock(),
  };
  file.chats.push(message);
  file.chats = file.chats.slice(-500);
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: object.value.companyId,
    objectId: object.value.id,
    unitId: input.unitId,
    action: "SECURITY_CHAT",
    targetType: "chat",
    targetId: message.id,
    target: text,
  });
  publishLive({ objectId: object.value.id, kind: "chat", title: "Ответ охраны" });
  const people = listMemberships().filter(
    (membership) =>
      membership.companyId === object.value.companyId &&
      membership.objectId === object.value.id &&
      membership.unitId === input.unitId &&
      (membership.role === "RESIDENT" || membership.role === "FAMILY_MEMBER") &&
      membership.status !== "REVOKED",
  );
  for (const membership of people) {
    pushNotice(membership.userId, text, "Охрана");
  }
  return { ok: true, value: { id: message.id } };
}

export function securityChatsFor(actor: StaffActor, objectId: string): SecurityChatRow[] {
  return (readOps().chats ?? [])
    .filter((item) => item.objectId === objectId && reaches(actor, item))
    .slice(-120)
    .map((item) => asRow(item, actor.userId));
}
