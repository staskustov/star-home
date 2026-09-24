import { plural } from "@/lib/format";
import { objectPresentation } from "@/lib/object-presentation";
import { findBuilding, findUnit, structureCounts, unitIdsOfBuilding, type CatalogObject } from "@/server/catalog-store";
import type { DeviceKind } from "@/server/device-kinds";
import { findUserById, residentCount } from "@/server/directory";
import { alarmsForObject, devicesForObject, eventsForObject, passesForObject, readOps, requestsForObject, type Device } from "@/server/ops-store";
import { auditLabel } from "@/server/audit-actions";
import { listAudit } from "@/server/audit-store";
import { auditVisible, shortTime } from "@/server/audit-view";
import { can, objectsInScope, reaches, wholeObject, type Scoped, type StaffActor } from "@/server/rbac/decide";
import { auditCategoriesOf } from "@/server/rbac/policy";
import type { DashboardAttention, DashboardFeedItem, DashboardObject, DashboardPulse, DashboardSystem, DashboardView } from "@/types/dashboard";

const systemGroups: { id: string; name: string; kinds: readonly DeviceKind[] }[] = [
  { id: "access", name: "Доступ", kinds: ["GATE", "WICKET", "BARRIER", "LOCK"] },
  { id: "cameras", name: "Камеры", kinds: ["CAMERA"] },
  { id: "climate", name: "Климат", kinds: ["CLIMATE", "HEATING"] },
  { id: "sensors", name: "Датчики", kinds: ["LEAK", "SMOKE", "FIRE", "MOTION"] },
  { id: "utilities", name: "Ресурсы", kinds: ["POWER", "WATER"] },
  { id: "comfort", name: "Комфорт", kinds: ["LIGHTING", "IRRIGATION", "CURTAIN"] },
];

const feedLimit = 8;

function within<T extends Scoped>(actor: StaffActor, rows: T[]): T[] {
  return rows.filter((row) => reaches(actor, row));
}
const attentionLimit = 5;

function sortKey(at: string): string {
  const match = at.match(/^(\d{2})\.(\d{2}) (\d{2}:\d{2})$/);
  return match ? `${match[2]}-${match[1]} ${match[3]}` : "";
}

function newestFirst<T>(items: T[], at: (item: T) => string): T[] {
  return [...items].sort((left, right) => sortKey(at(right)).localeCompare(sortKey(at(left))));
}

function today(): string {
  return new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function placeOf(unitId: string | null): string {
  return unitId ? (findUnit(unitId)?.name ?? "Объект") : "Объект";
}

function attentionFor(actor: StaffActor, object: CatalogObject): DashboardAttention[] {
  const items: DashboardAttention[] = [];
  if (can(actor, "security.view")) {
    const alarms = newestFirst(
      within(actor, alarmsForObject(object.id)).filter((alarm) => alarm.status === "OPEN"),
      (alarm) => alarm.at,
    );
    const latest = alarms[0];
    if (latest) {
      items.push({
        id: "alarms",
        tone: "danger",
        title: plural(alarms.length, ["вызов охраны ждёт ответа", "вызова охраны ждут ответа", "вызовов охраны ждут ответа"]),
        detail: `Последний: ${placeOf(latest.unitId)} · ${latest.at}`,
        href: "/security",
      });
    }
  }
  if (can(actor, "devices.view")) {
    for (const device of within(actor, devicesForObject(object.id))) {
      if (device.work !== "FAULT" && device.work !== "OFF") continue;
      items.push({
        id: `device-${device.id}`,
        tone: device.work === "FAULT" ? "danger" : "warning",
        title: `${device.name}: ${device.work === "FAULT" ? "неисправно" : "отключено"}`,
        detail: placeOf(device.unitId),
        href: "/admin/devices",
      });
    }
  }
  if (can(actor, "access.view")) {
    const unconfirmed = newestFirst(
      within(actor, eventsForObject(object.id)).filter((event) => event.result === "UNCONFIRMED"),
      (event) => event.time,
    );
    const latest = unconfirmed[0];
    if (latest) {
      items.push({
        id: "unconfirmed",
        tone: "warning",
        title: plural(unconfirmed.length, ["команда не подтверждена", "команды не подтверждены", "команд не подтверждены"]),
        detail: `Последняя: ${latest.time}`,
        href: "/admin/access",
      });
    }
  }
  if (can(actor, "service.view")) {
    const fresh = within(actor, requestsForObject(object.id)).filter((request) => request.status === "CREATED");
    const latest = fresh[0];
    if (latest) {
      items.push({
        id: "requests",
        tone: "warning",
        title: plural(fresh.length, ["заявка ждёт принятия", "заявки ждут принятия", "заявок ждут принятия"]),
        detail: `${latest.category} · ${placeOf(latest.unitId)}`,
        href: "/admin/requests",
      });
    }
  }
  return [...items.filter((item) => item.tone === "danger"), ...items.filter((item) => item.tone !== "danger")];
}

function statusFor(actor: StaffActor, attention: DashboardAttention[]): DashboardObject["status"] {
  const first = attention[0];
  const more = attention.length > 1 ? ` · и ещё ${attention.length - 1}` : "";
  if (first?.id === "alarms") return { tone: "danger", title: "Тревога", detail: `${first.title}${more}` };
  if (first) return { tone: "warning", title: "Требует внимания", detail: `${first.title}${more}` };
  const checked = [
    can(actor, "security.view") ? "тревог нет" : null,
    can(actor, "devices.view") ? "устройства на связи" : null,
    can(actor, "service.view") ? "новых заявок нет" : null,
  ].filter(Boolean);
  const detail = checked.length > 0 ? `${checked.join(", ")}.` : "Проблем в доступных разделах нет.";
  return { tone: "success", title: "Всё в порядке", detail: detail.charAt(0).toUpperCase() + detail.slice(1) };
}

function pulseFor(actor: StaffActor, object: CatalogObject): DashboardPulse[] {
  const pulse: DashboardPulse[] = [];
  if (can(actor, "objects.view")) {
    pulse.push({
      id: "units",
      value: actor.scope.buildingId ? unitIdsOfBuilding(actor.scope.buildingId).length : structureCounts(object.id, object.type).units,
      label: objectPresentation[object.type].unitsLabel,
      href: `/admin/objects/${object.id}`,
      alert: false,
    });
  }
  if (can(actor, "residents.view")) {
    pulse.push({ id: "residents", value: residentCount(object.id, (unitId) => reaches(actor, { companyId: object.companyId, objectId: object.id, unitId })), label: "Жители", href: "/admin/residents", alert: false });
  }
  if (can(actor, "access.view")) {
    pulse.push({ id: "guests", value: within(actor, passesForObject(object.id)).length, label: "Гостевые пропуска", href: "/admin/access", alert: false });
  }
  if (can(actor, "service.view")) {
    const open = within(actor, requestsForObject(object.id)).filter((request) => request.status !== "DONE" && request.status !== "CLOSED").length;
    pulse.push({ id: "requests", value: open, label: "Открытые заявки", href: "/admin/requests", alert: false });
  }
  if (can(actor, "security.view")) {
    const open = within(actor, alarmsForObject(object.id)).filter((alarm) => alarm.status === "OPEN").length;
    pulse.push({ id: "alarms", value: open, label: "Тревоги", href: "/security", alert: open > 0 });
  }
  if (can(actor, "payments.view")) {
    const open = within(actor, readOps().invoices).filter((invoice) => invoice.objectId === object.id && invoice.status === "OPEN").length;
    pulse.push({ id: "invoices", value: open, label: "Открытые счета", href: "/admin/payments", alert: false });
  }
  if (can(actor, "access.view")) {
    const day = today();
    const count = within(actor, eventsForObject(object.id)).filter((event) => event.time.startsWith(`${day} `)).length;
    pulse.push({ id: "access", value: count, label: "Доступ сегодня", href: "/admin/access", alert: false });
  }
  return pulse;
}

function systemState(devices: Device[]): Pick<DashboardSystem, "state" | "tone"> {
  const total = devices.length;
  const faults = devices.filter((device) => device.work === "FAULT").length;
  const off = devices.filter((device) => device.work === "OFF").length;
  if (faults > 0) return { tone: "danger", state: total > 1 ? `${faults} из ${total} неисправно` : "Неисправно" };
  if (off > 0) return { tone: "warning", state: `${total - off} из ${total} на связи` };
  return { tone: "success", state: "На связи" };
}

function systemsFor(actor: StaffActor, object: CatalogObject): DashboardSystem[] | null {
  if (!can(actor, "devices.view")) return null;
  const devices = within(actor, devicesForObject(object.id));
  return systemGroups.flatMap((group) => {
    const members = devices.filter((device) => group.kinds.includes(device.kind));
    if (members.length === 0) return [];
    return [{ id: group.id, name: group.name, ...systemState(members) }];
  });
}

function feedFor(actor: StaffActor, object: CatalogObject): DashboardFeedItem[] | null {
  if (can(actor, "audit.view") && wholeObject(actor) && !auditCategoriesOf(actor.role)) {
    return listAudit()
      .filter((entry) => entry.objectId === object.id && auditVisible(actor, entry))
      .slice(0, feedLimit)
      .map((entry) => ({
        id: entry.id,
        at: shortTime(entry.at),
        title: auditLabel(entry.action),
        detail: `${findUserById(entry.actorUserId)?.name ?? "Сотрудник"} · ${entry.target}`,
        tone: entry.result !== "SUCCESS" ? "warning" : entry.action === "RAISE_ALARM" ? "danger" : "success",
      }));
  }
  if (can(actor, "access.view")) {
    return newestFirst(within(actor, eventsForObject(object.id)), (event) => event.time)
      .slice(0, feedLimit)
      .map((event) => ({
        id: event.id,
        at: event.time,
        title: event.title,
        detail: placeOf(event.unitId),
        tone: event.result === "SUCCESS" ? "success" : event.result === "DENIED" ? "danger" : "warning",
      }));
  }
  return null;
}

function objectDashboard(actor: StaffActor, object: CatalogObject): DashboardObject {
  const attention = attentionFor(actor, object);
  return {
    id: object.id,
    name: object.name,
    typeLabel: [objectPresentation[object.type].label, actor.scope.buildingId ? findBuilding(actor.scope.buildingId)?.name : null].filter(Boolean).join(" · "),
    address: object.address,
    status: statusFor(actor, attention),
    attention: attention.slice(0, attentionLimit),
    pulse: pulseFor(actor, object),
    systems: systemsFor(actor, object),
    feed: feedFor(actor, object),
  };
}

export function dashboardFor(actor: StaffActor): DashboardView {
  return {
    scope: actor.scope.kind === "COMPANY" || actor.scope.kind === "PLATFORM" ? "COMPANY" : "OBJECT",
    canCreateObject: can(actor, "objects.create"),
    canEditStructure: can(actor, "objects.structure.edit"),
    objects: objectsInScope(actor).map((object) => objectDashboard(actor, object)),
  };
}
