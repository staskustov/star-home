import { formatHumidity, formatTemperature } from "@/lib/format";
import { findUnit } from "@/server/catalog-store";
import { deviceLabel, isOpener } from "@/server/device-kinds";
import { findUserById } from "@/server/directory";
import { readOps } from "@/server/ops-store";

export const auditActionLabels: Record<string, string> = {
  OPEN_GATE: "Открытие ворот",
  CREATE_PASS: "Пропуск",
  CREATE_REQUEST: "Заявка",
  UPDATE_REQUEST: "Статус заявки",
  PAY_INVOICE: "Оплата",
  RAISE_ALARM: "Вызов охраны",
};

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

export function companyOps(companyId: string) {
  const file = readOps();
  return {
    passes: file.passes
      .filter((pass) => pass.companyId === companyId)
      .map((pass) => ({ id: pass.id, objectId: pass.objectId, guestName: pass.guestName, detail: pass.detail, unitName: unitName(pass.unitId) })),
    events: file.events
      .filter((event) => event.companyId === companyId)
      .map((event) => ({ id: event.id, objectId: event.objectId, time: event.time, title: event.title, result: event.result })),
    requests: file.requests
      .filter((request) => request.companyId === companyId)
      .map((request) => ({
        id: request.id,
        objectId: request.objectId,
        unitName: unitName(request.unitId),
        category: request.category,
        text: request.text,
        status: request.status,
      })),
    invoices: file.invoices
      .filter((invoice) => invoice.companyId === companyId)
      .map((invoice) => ({
        id: invoice.id,
        objectId: invoice.objectId,
        unitName: unitName(invoice.unitId),
        title: invoice.title,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
      })),
    devices: file.devices
      .filter((device) => device.companyId === companyId)
      .map((device) => {
        const reading = file.readings.find((item) => item.deviceId === device.id);
        return {
          objectId: device.objectId,
          name: device.name,
          kind: deviceLabel(device.kind),
          state:
            device.work === "FAULT"
              ? "Неисправно"
              : device.work === "OFF"
                ? "Отключено"
                : reading
                  ? `${formatTemperature(reading.temperatureC)} · ${formatHumidity(reading.humidityPercent)}`
                  : "На связи",
        };
      }),
    alarms: file.alarms
      .filter((alarm) => alarm.companyId === companyId)
      .map((alarm) => ({ id: alarm.id, objectId: alarm.objectId, title: alarm.title, unitName: unitName(alarm.unitId), at: alarm.at, status: alarm.status })),
    audit: file.audit
      .filter((entry) => entry.companyId === companyId)
      .map((entry) => ({
        id: entry.id,
        objectId: entry.objectId,
        actor: findUserById(entry.actorUserId)?.name ?? "Сотрудник",
        action: auditActionLabels[entry.action] ?? entry.action,
        target: entry.target,
        result: entry.result,
        error: entry.error,
        at: entry.at,
      })),
    meters: file.meters
      .filter((meter) => meter.companyId === companyId)
      .map((meter) => {
        const latest = file.meterReadings.filter((reading) => reading.meterId === meter.id).at(-1);
        return {
          objectId: meter.objectId,
          name: meter.name,
          value: latest ? String(latest.value).replace(".", ",") : "—",
          unit: meter.unit,
        };
      }),
    turns: file.turns
      .filter((turn) => turn.companyId === companyId)
      .map((turn) => ({
        id: turn.id,
        objectId: findUnit(turn.unitId)?.objectId ?? "",
        prompt: turn.prompt,
        reply: turn.reply,
      })),
  };
}
