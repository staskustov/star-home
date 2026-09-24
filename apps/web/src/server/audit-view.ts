import { auditCategories, auditCategoryLabels, auditLabel, isAuditCategory, type AuditCategory } from "@/server/audit-actions";
import { listAudit, type AuditRecord, type AuditResult } from "@/server/audit-store";
import { findBuilding, findObject, findUnit } from "@/server/catalog-store";
import { findUserById } from "@/server/directory";
import { recordAudit } from "@/server/operations";
import { can, companyWide, inScope, objectsInScope, type StaffActor } from "@/server/rbac/decide";
import { auditCategoriesOf, roleLabels } from "@/server/rbac/policy";
import type { AuditBoard, AuditRow } from "@/types/audit";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const results: readonly AuditResult[] = ["SUCCESS", "DENIED", "ERROR"];
const resultLabels: Record<AuditResult, string> = { SUCCESS: "Выполнено", DENIED: "Отказано", ERROR: "Ошибка" };
const pageSizes = [50, 100, 200, 500] as const;
const exportLimit = 5000;

export function auditVisible(actor: StaffActor, entry: AuditRecord): boolean {
  if (!can(actor, "audit.view") || entry.companyId !== actor.companyId) return false;
  const allowed = auditCategoriesOf(actor.role);
  if (allowed && !allowed.has(entry.category)) return false;
  if (!entry.objectId) return companyWide(actor);
  if (!inScope(actor, entry.objectId)) return false;
  if (actor.scope.kind !== "BUILDING") return true;
  const building = (entry.unitId ? findUnit(entry.unitId)?.buildingId : null) ?? entry.buildingId;
  if (building) return building === actor.scope.buildingId;
  if (entry.unitId) return false;
  return entry.category === "ACCESS" || entry.category === "SECURITY";
}

export function shortTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function longTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${day}, ${time}`;
}

function placeOf(entry: AuditRecord): string {
  if (!entry.objectId) return "Вся компания";
  const parts = [findObject(entry.objectId)?.name ?? "Объект"];
  const unit = entry.unitId ? findUnit(entry.unitId) : undefined;
  const buildingId = unit?.buildingId ?? entry.buildingId;
  const building = buildingId ? findBuilding(buildingId)?.name : undefined;
  if (building) parts.push(building);
  if (unit) parts.push(unit.name);
  return parts.join(" · ");
}

export function auditRow(entry: AuditRecord): AuditRow {
  return {
    id: entry.id,
    at: entry.at,
    time: longTime(entry.at),
    actor: findUserById(entry.actorUserId)?.name ?? "Неизвестный пользователь",
    role: entry.actorRole ? roleLabels[entry.actorRole] : null,
    place: placeOf(entry),
    category: entry.category,
    categoryLabel: auditCategoryLabels[entry.category],
    action: auditLabel(entry.action),
    target: entry.target,
    result: entry.result,
    resultLabel: resultLabels[entry.result],
    reason: entry.reason,
    ip: entry.ip,
    device: entry.device,
    changes: entry.changes ?? [],
  };
}

type Filters = { category: AuditCategory | null; objectId: string | null; actorUserId: string | null; result: AuditResult | null };

function filtersOf(actor: StaffActor, input: Record<string, unknown>): Filters {
  const objectId = typeof input.objectId === "string" && inScope(actor, input.objectId) ? input.objectId : null;
  return {
    category: isAuditCategory(input.category) ? input.category : null,
    objectId,
    actorUserId: typeof input.actorUserId === "string" && input.actorUserId.length <= 80 ? input.actorUserId : null,
    result: typeof input.result === "string" && results.includes(input.result as AuditResult) ? (input.result as AuditResult) : null,
  };
}

function matching(actor: StaffActor, filters: Filters): AuditRecord[] {
  return listAudit().filter(
    (entry) =>
      auditVisible(actor, entry) &&
      (!filters.category || entry.category === filters.category) &&
      (!filters.objectId || entry.objectId === filters.objectId) &&
      (!filters.actorUserId || entry.actorUserId === filters.actorUserId) &&
      (!filters.result || entry.result === filters.result),
  );
}

export function auditBoard(actor: StaffActor, input: Record<string, unknown>): AuditBoard {
  const filters = filtersOf(actor, input);
  const limit = pageSizes.find((size) => size === Number(input.limit)) ?? pageSizes[0];
  const visible = listAudit().filter((entry) => auditVisible(actor, entry));
  const rows = matching(actor, filters);
  const allowed = auditCategoriesOf(actor.role);
  const actors = new Map<string, string>();
  for (const entry of visible) {
    if (!actors.has(entry.actorUserId)) actors.set(entry.actorUserId, findUserById(entry.actorUserId)?.name ?? "Неизвестный пользователь");
  }
  return {
    entries: rows.slice(0, limit).map(auditRow),
    total: rows.length,
    limit,
    nextLimit: pageSizes.find((size) => size > limit && rows.length > limit) ?? null,
    filters: {
      category: filters.category,
      objectId: filters.objectId,
      actorUserId: filters.actorUserId,
      result: filters.result,
    },
    options: {
      categories: auditCategories.filter((category) => !allowed || allowed.has(category)).map((value) => ({ value, label: auditCategoryLabels[value] })),
      objects: objectsInScope(actor).map((object) => ({ value: object.id, label: object.name })),
      actors: [...actors].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label, "ru")),
      results: results.map((value) => ({ value, label: resultLabels[value] })),
    },
    canExport: can(actor, "audit.export"),
  };
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function auditExport(actor: StaffActor, input: Record<string, unknown>): Success<{ fileName: string; csv: string }> | Failure {
  if (!can(actor, "audit.export") || !can(actor, "audit.view")) return { ok: false, status: 403, message: "Нет доступа" };
  const rows = matching(actor, filtersOf(actor, input)).slice(0, exportLimit).map(auditRow);
  const header = ["Время", "Сотрудник", "Роль", "Место", "Категория", "Действие", "Цель", "Результат", "Причина", "IP", "Устройство", "Изменения"];
  const lines = rows.map((row) =>
    [
      row.at,
      row.actor,
      row.role ?? "",
      row.place,
      row.categoryLabel,
      row.action,
      row.target,
      row.resultLabel,
      row.reason,
      row.ip ?? "",
      row.device ?? "",
      row.changes.map((change) => `${change.field}: ${change.from} → ${change.to}`).join("; "),
    ]
      .map(csvCell)
      .join(","),
  );
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: companyWide(actor) ? null : actor.scope.objectId,
    buildingId: actor.scope.buildingId,
    action: "AUDIT_EXPORT",
    targetType: "audit",
    target: `${rows.length} записей`,
  });
  return { ok: true, value: { fileName: `star-home-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv: `\ufeff${[header.map(csvCell).join(","), ...lines].join("\r\n")}` } };
}
