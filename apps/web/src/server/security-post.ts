import { listAudit } from "@/server/audit-store";
import { auditRow, auditVisible, shortTime } from "@/server/audit-view";
import { findBuilding, findUnit } from "@/server/catalog-store";
import { deviceLabel, isOpener } from "@/server/device-kinds";
import { findUserById } from "@/server/directory";
import { recordAudit } from "@/server/operations";
import { clock, readOps, writeOps, type Alarm, type Device } from "@/server/ops-store";
import { can, objectFor, objectsInScope, reaches, type StaffActor } from "@/server/rbac/decide";
import { publishLive } from "@/server/store-bind";
import type { PassCheck, SecurityCamera, SecurityCameraWall, SecurityPostView } from "@/types/security";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };
const closedShown = 10;
const eventsShown = 20;
const journalShown = 15;

export function placeName(unitId: string | null | undefined): string {
  if (!unitId) return "Общая территория";
  const unit = findUnit(unitId);
  if (!unit) return "Единица";
  const building = unit.buildingId ? findBuilding(unit.buildingId)?.name : undefined;
  return building ? `${building} · ${unit.name}` : unit.name;
}

export function workState(device: Device): { state: string; ready: boolean } {
  if (device.work === "FAULT") return { state: "Неисправно", ready: false };
  if (device.work === "OFF") return { state: "Выведено из работы", ready: false };
  return { state: "В работе", ready: true };
}

function handler(userId: string | undefined): string | null {
  return userId ? (findUserById(userId)?.name ?? "Сотрудник") : null;
}

function postObject(actor: StaffActor, objectId: unknown) {
  const objects = objectsInScope(actor);
  const wanted = typeof objectId === "string" && objectId ? objectId : objects[0]?.id;
  const object = objectFor(actor, wanted);
  return { objects: objects.map((item) => ({ id: item.id, name: item.name })), object };
}

function cameraRows(actor: StaffActor, objectId: string): SecurityCamera[] {
  return readOps()
    .devices.filter((device) => device.objectId === objectId && device.kind === "CAMERA" && reaches(actor, device))
    .map((device) => ({ id: device.id, name: device.name, place: placeName(device.unitId), ...workState(device) }));
}

export function securityCameras(actor: StaffActor, objectId: unknown): Success<SecurityCameraWall> | Failure {
  if (!can(actor, "security.view") || !can(actor, "security.camera.view")) return denied;
  const { objects, object } = postObject(actor, objectId);
  if (!object.ok) return object;
  return { ok: true, value: { objects, objectId: object.value.id, objectName: object.value.name, cameras: cameraRows(actor, object.value.id) } };
}

export function securityPost(actor: StaffActor, objectId: unknown): Success<SecurityPostView> | Failure {
  if (!can(actor, "security.view")) return denied;
  const { objects, object } = postObject(actor, objectId);
  if (!object.ok) return object;
  const file = readOps();
  const here = <T extends { companyId: string; objectId: string; unitId: string | null }>(rows: T[]): T[] =>
    rows.filter((row) => row.objectId === object.value.id && reaches(actor, row));
  const alarms = here(file.alarms);
  const active = alarms.filter((alarm) => alarm.status !== "CLOSED");
  const closed = alarms.filter((alarm) => alarm.status === "CLOSED").slice(0, closedShown);
  const devices = here(file.devices);
  return {
    ok: true,
    value: {
      objects,
      objectId: object.value.id,
      objectName: object.value.name,
      can: {
        handle: can(actor, "security.alarm.handle"),
        open: can(actor, "access.gate.open"),
        camera: can(actor, "security.camera.view"),
        passes: can(actor, "access.view"),
        journal: can(actor, "audit.view"),
        console: can(actor, "dashboard.view"),
      },
      alarms: [...active, ...closed].map((alarm) => ({
        id: alarm.id,
        title: alarm.title,
        place: placeName(alarm.unitId),
        at: alarm.at,
        status: alarm.status,
        handledBy: handler(alarm.handledBy),
        handledAt: alarm.handledAt ?? null,
      })),
      points: devices
        .filter((device) => isOpener(device.kind) && device.unitId === null)
        .map((device) => ({ id: device.id, name: device.name, kind: deviceLabel(device.kind), ...workState(device) })),
      cameras: can(actor, "security.camera.view") ? cameraRows(actor, object.value.id) : [],
      passes: can(actor, "access.view")
        ? here(file.passes).map((pass) => ({ id: pass.id, guestName: pass.guestName, place: placeName(pass.unitId), detail: pass.detail, vehicle: pass.vehicle || "" }))
        : [],
      events: can(actor, "access.view")
        ? here(file.events)
            .slice(0, eventsShown)
            .map((event) => ({ id: event.id, time: event.time, title: event.title, result: event.result === "SUCCESS" ? "SUCCESS" : "UNCONFIRMED" }))
        : [],
      journal: can(actor, "audit.view")
        ? listAudit()
            .filter((entry) => entry.objectId === object.value.id && (entry.category === "ACCESS" || entry.category === "SECURITY") && auditVisible(actor, entry))
            .slice(0, journalShown)
            .map((entry) => {
              const row = auditRow(entry);
              return { id: row.id, time: shortTime(entry.at), actor: row.actor, action: row.action, target: row.target, result: row.result };
            })
        : [],
    },
  };
}

export function handleAlarmFor(actor: StaffActor, alarmId: unknown, step: unknown): Success<{ status: Alarm["status"] }> | Failure {
  if (!can(actor, "security.alarm.handle")) return denied;
  if (step !== "ACCEPT" && step !== "CLOSE") return { ok: false, status: 400, message: "Неизвестное действие" };
  if (typeof alarmId !== "string" || !alarmId) return { ok: false, status: 404, message: "Тревога не найдена" };
  const file = readOps();
  const alarm = file.alarms.find((item) => item.id === alarmId && item.companyId === actor.companyId);
  if (!alarm) return { ok: false, status: 404, message: "Тревога не найдена" };
  if (!reaches(actor, alarm)) return denied;
  if (alarm.status === "CLOSED") return { ok: false, status: 409, message: "Тревога уже закрыта" };
  if (step === "ACCEPT" && alarm.status === "ACCEPTED") return { ok: false, status: 409, message: "Тревога уже принята" };
  const from = alarm.status;
  alarm.status = step === "ACCEPT" ? "ACCEPTED" : "CLOSED";
  alarm.handledBy = actor.userId;
  alarm.handledAt = clock();
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: alarm.companyId,
    objectId: alarm.objectId,
    unitId: alarm.unitId,
    action: step === "ACCEPT" ? "ALARM_ACCEPT" : "ALARM_CLOSE",
    targetType: "alarm",
    targetId: alarm.id,
    target: `${alarm.title} · ${placeName(alarm.unitId)}`,
    changes: [{ field: "Статус", from, to: alarm.status }],
  });
  publishLive({ objectId: alarm.objectId, kind: "alarm", title: step === "ACCEPT" ? "Тревога принята" : "Тревога закрыта" });
  return { ok: true, value: { status: alarm.status } };
}

export function checkPassFor(actor: StaffActor, objectId: unknown, code: unknown): Success<PassCheck> | Failure {
  if (!can(actor, "access.view")) return denied;
  const object = objectFor(actor, objectId);
  if (!object.ok) return object;
  const typed = typeof code === "string" ? code.replace(/[\s-]/g, "").toUpperCase() : "";
  if (!/^[A-Z0-9]{4,16}$/.test(typed)) return { ok: false, status: 400, message: "Введите код пропуска" };
  const pass = readOps().passes.find((item) => item.objectId === object.value.id && item.companyId === object.value.companyId && item.code === typed);
  const found = pass && reaches(actor, pass) ? pass : undefined;
  recordAudit({
    actorUserId: actor.userId,
    companyId: object.value.companyId,
    objectId: object.value.id,
    unitId: found?.unitId ?? null,
    action: "PASS_CHECK",
    targetType: "pass",
    targetId: found?.id ?? null,
    target: found ? found.guestName : "Код не найден",
    result: found ? "SUCCESS" : "DENIED",
    reason: found ? "" : "Пропуск не найден",
  });
  if (!found) return { ok: false, status: 404, message: "Пропуск не найден" };
  return { ok: true, value: { guestName: found.guestName, place: placeName(found.unitId), detail: found.detail, vehicle: found.vehicle || "" } };
}
