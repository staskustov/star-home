import { formatHumidity, formatTemperature } from "@/lib/format";
import { findUnit } from "@/server/catalog-store";
import { deviceLabel, isOpener } from "@/server/device-kinds";
import { findUserById } from "@/server/directory";
import { readOps, type AuditEntry } from "@/server/ops-store";
import { can, reaches, type Scoped, type StaffActor } from "@/server/rbac/decide";
import type { Permission } from "@/server/rbac/permissions";
import { auditCategoriesOf, type AuditCategory } from "@/server/rbac/policy";

export const auditActionLabels: Record<string, string> = {
  OPEN_GATE: "Открытие ворот",
  CREATE_PASS: "Пропуск",
  CREATE_REQUEST: "Заявка",
  UPDATE_REQUEST: "Статус заявки",
  PAY_INVOICE: "Оплата",
  RAISE_ALARM: "Вызов охраны",
  TEAM_ADD: "Новый сотрудник",
  TEAM_EDIT: "Данные сотрудника",
  TEAM_ROLE: "Смена роли",
  TEAM_SCOPE: "Смена объекта",
  TEAM_BLOCK: "Блокировка",
  TEAM_RESTORE: "Восстановление доступа",
  TEAM_REMOVE: "Отзыв доступа",
  ROLES_EDIT: "Права роли",
};

const auditActionCategories: Record<string, AuditCategory> = {
  OPEN_GATE: "ACCESS",
  CREATE_PASS: "ACCESS",
  CREATE_REQUEST: "SERVICE",
  UPDATE_REQUEST: "SERVICE",
  PAY_INVOICE: "FINANCE",
  RAISE_ALARM: "SECURITY",
  TEAM_ADD: "RBAC",
  TEAM_EDIT: "RBAC",
  TEAM_ROLE: "RBAC",
  TEAM_SCOPE: "RBAC",
  TEAM_BLOCK: "RBAC",
  TEAM_RESTORE: "RBAC",
  TEAM_REMOVE: "RBAC",
  ROLES_EDIT: "RBAC",
};

export function auditVisible(actor: StaffActor, entry: AuditEntry): boolean {
  if (!can(actor, "audit.view") || !reaches(actor, entry)) return false;
  const allowed = auditCategoriesOf(actor.role);
  if (!allowed) return true;
  const category = auditActionCategories[entry.action];
  return Boolean(category) && allowed.has(category as AuditCategory);
}

function unitName(unitId: string | null): string {
  if (!unitId) return "Объект";
  return findUnit(unitId)?.name ?? "Единица";
}

export function residentAccess(unitId: string, objectId: string) {
  const file = readOps();
  return {
    passes: file.passes.filter((pass) => pass.unitId === unitId).map((pass) => ({
      id: pass.id,
      guestName: pass.guestName,
      detail: pass.detail,
      vehicle: pass.vehicle || "",
      code: pass.code,
    })),
    points: file.devices
      .filter((device) => device.objectId === objectId && (device.unitId === unitId || device.unitId === null))
      .filter((device) => isOpener(device.kind))
      .map((device) => ({ id: device.id, name: device.name, kind: deviceLabel(device.kind) })),
    events: file.events
      .filter((event) => event.objectId === objectId && (event.unitId === unitId || !event.unitId))
      .map((event) => ({ id: event.id, time: event.time, title: event.title, result: event.result })),
  };
}

export function residentRequests(unitId: string) {
  return readOps()
    .requests.filter((request) => request.unitId === unitId)
    .map((request) => ({ id: request.id, category: request.category, text: request.text, status: request.status }));
}

export function residentNotices(userId: string) {
  return readOps()
    .notices.filter((notice) => notice.userId === userId)
    .slice(0, 5)
    .map((notice) => ({ id: notice.id, title: notice.title, body: notice.body, at: notice.at }));
}

export const deskSections = {
  access: "access.view",
  security: "security.view",
  requests: "service.view",
  payments: "payments.view",
  devices: "devices.view",
  ai: "ai.view",
} as const satisfies Record<string, Permission>;

export type DeskSection = keyof typeof deskSections;

export function isDeskSection(value: unknown): value is DeskSection {
  return typeof value === "string" && Object.hasOwn(deskSections, value);
}

function deviceState(device: { id: string; work?: string }, readings: { deviceId: string; temperatureC: number; humidityPercent: number }[]): string {
  if (device.work === "FAULT") return "Неисправно";
  if (device.work === "OFF") return "Отключено";
  const reading = readings.find((item) => item.deviceId === device.id);
  return reading ? `${formatTemperature(reading.temperatureC)} · ${formatHumidity(reading.humidityPercent)}` : "На связи";
}

export function deskFor(actor: StaffActor, section: DeskSection) {
  const file = readOps();
  const mine = <T extends Scoped>(rows: T[]): T[] => rows.filter((row) => reaches(actor, row));
  if (section === "access") {
    return {
      passes: mine(file.passes).map((pass) => ({ id: pass.id, objectId: pass.objectId, guestName: pass.guestName, detail: pass.detail, unitName: unitName(pass.unitId) })),
      events: mine(file.events).map((event) => ({ id: event.id, objectId: event.objectId, time: event.time, title: event.title, result: event.result })),
    };
  }
  if (section === "requests") {
    return {
      requests: mine(file.requests).map((request) => ({
        id: request.id,
        objectId: request.objectId,
        unitName: unitName(request.unitId),
        category: request.category,
        text: request.text,
        status: request.status,
      })),
    };
  }
  if (section === "payments") {
    return {
      invoices: mine(file.invoices).map((invoice) => ({
        id: invoice.id,
        objectId: invoice.objectId,
        unitName: unitName(invoice.unitId),
        title: invoice.title,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
      })),
    };
  }
  if (section === "devices") {
    return {
      devices: mine(file.devices).map((device) => ({ objectId: device.objectId, name: device.name, kind: deviceLabel(device.kind), state: deviceState(device, file.readings) })),
      meters: mine(file.meters).map((meter) => {
        const latest = file.meterReadings.filter((reading) => reading.meterId === meter.id).at(-1);
        return { objectId: meter.objectId, name: meter.name, value: latest ? String(latest.value).replace(".", ",") : "—", unit: meter.unit };
      }),
    };
  }
  if (section === "security") {
    return {
      alarms: mine(file.alarms).map((alarm) => ({ id: alarm.id, objectId: alarm.objectId, title: alarm.title, unitName: unitName(alarm.unitId), at: alarm.at, status: alarm.status })),
      cameras: can(actor, "security.camera.view")
        ? mine(file.devices)
            .filter((device) => device.kind === "CAMERA")
            .map((device) => ({ objectId: device.objectId, name: device.name, state: deviceState(device, file.readings) }))
        : [],
      audit: can(actor, "audit.view")
        ? file.audit.filter((entry) => auditVisible(actor, entry)).map((entry) => ({
            id: entry.id,
            objectId: entry.objectId,
            actor: findUserById(entry.actorUserId)?.name ?? "Сотрудник",
            action: auditActionLabels[entry.action] ?? entry.action,
            target: entry.target,
            result: entry.result,
            error: entry.error,
            at: entry.at,
          }))
        : [],
    };
  }
  return {
    turns: file.turns.flatMap((turn) => {
      const objectId = findUnit(turn.unitId)?.objectId ?? "";
      return reaches(actor, { companyId: turn.companyId, objectId, unitId: turn.unitId }) ? [{ id: turn.id, objectId, prompt: turn.prompt, reply: turn.reply }] : [];
    }),
  };
}
