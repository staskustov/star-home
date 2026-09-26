import { formatHumidity, formatTemperature } from "@/lib/format";
import { findUnit, roomsOf, unitIdsOf } from "@/server/catalog-store";
import { deviceLabel, isOpener } from "@/server/device-kinds";
import { listAudit } from "@/server/audit-store";
import { auditRow, auditVisible, shortTime } from "@/server/audit-view";
import { readOps } from "@/server/ops-store";
import { can, reaches, type Scoped, type StaffActor } from "@/server/rbac/decide";
import type { Permission } from "@/server/rbac/permissions";

const deskAuditLimit = 100;

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
    .map((notice) => ({ id: notice.id, title: notice.title, body: notice.body, at: notice.at, severity: notice.severity ?? "INFO" }));
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
      points: mine(file.devices)
        .filter((device) => isOpener(device.kind))
        .map((device) => ({
          id: device.id,
          objectId: device.objectId,
          name: device.name,
          endpoint: device.endpoint ?? "",
          latch: (device.latch === "OPEN" ? "OPEN" : "CLOSED") as "OPEN" | "CLOSED",
          work: (device.work === "FAULT" ? "FAULT" : device.work === "OFF" ? "OFF" : "ON") as "ON" | "OFF" | "FAULT",
          status: device.work === "FAULT" ? "Неисправно" : device.work === "OFF" ? "Отключено" : device.latch === "OPEN" ? "Открыто" : "Закрыто",
        })),
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
      devices: mine(file.devices).map((device) => {
        const gateway = device.gatewayId ? file.gateways.find((item) => item.id === device.gatewayId) : undefined;
        return {
          id: device.id,
          objectId: device.objectId,
          name: device.name,
          kind: deviceLabel(device.kind),
          state: deviceState(device, file.readings),
          availability: device.availability ?? "UNKNOWN",
          lastSeen: device.lastSeen,
          adapter: device.adapter,
          gatewayName: gateway?.name ?? null,
          lastError: gateway?.lastError ?? null,
          planFloor: device.planFloor ?? null,
          planX: device.planX ?? null,
          planY: device.planY ?? null,
        };
      }),
      gateways: mine(file.gateways).map((gateway) => ({
        id: gateway.id,
        objectId: gateway.objectId,
        name: gateway.name,
        adapter: gateway.adapter,
        status: gateway.status,
        lastSeen: gateway.lastSeen,
        lastError: gateway.lastError,
        paired: Boolean(gateway.tokenHash),
        connectedDevices: file.devices.filter((device) => device.gatewayId === gateway.id).length,
      })),
      events: mine(file.smartEvents)
        .slice(0, 12)
        .map((event) => ({
          id: event.id,
          objectId: event.objectId,
          title: event.title,
          at: event.at,
          result: event.result,
          severity: event.severity ?? "INFO",
          source: event.source ?? "SYSTEM",
        })),
      commandLogs: mine(file.commandLogs ?? [])
        .slice(0, 20)
        .map((row) => ({
          id: row.id,
          objectId: row.objectId,
          at: row.at,
          deviceId: row.deviceId,
          command: row.command,
          result: row.result,
          source: row.source,
          risk: row.risk,
        })),
      plans: [...new Set(mine(file.devices).map((device) => device.unitId).filter((id): id is string => Boolean(id)))].flatMap((unitId) => {
        const unit = findUnit(unitId);
        if (!unit?.plans?.length) return [];
        const pins = mine(file.devices).filter((device) => device.unitId === unitId && device.planX != null && device.planY != null);
        return [
          {
            unitId,
            unitName: unit.name,
            objectId: unit.objectId,
            floors: unit.plans.map((plan) => ({
              floor: plan.floor,
              image: plan.image,
              pins: pins
                .filter((device) => device.planFloor === plan.floor)
                .map((device) => ({ deviceId: device.id, name: device.name, x: device.planX as number, y: device.planY as number })),
            })),
          },
        ];
      }),
      rooms: [...new Set(mine(file.devices).map((device) => device.objectId))].flatMap((objectId) =>
        unitIdsOf(objectId).flatMap((unitId) =>
          roomsOf(unitId).map((room) => ({ id: room.id, objectId: room.objectId, name: room.name })),
        ),
      ),
      canCommand: can(actor, "devices.command"),
      canPair: can(actor, "devices.edit"),
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
        ? listAudit()
            .filter((entry) => auditVisible(actor, entry))
            .slice(0, deskAuditLimit)
            .map((entry) => {
              const row = auditRow(entry);
              return { id: row.id, objectId: entry.objectId ?? "", actor: row.actor, action: row.action, target: row.target, result: row.result, error: row.reason, at: shortTime(entry.at) };
            })
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
