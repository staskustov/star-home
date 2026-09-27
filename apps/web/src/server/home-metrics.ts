import {
  defaultMetricItems,
  homeMetricCatalog,
  homeMetricKeys,
  metricsSettingsFor,
  readOps,
  writeOps,
  type HomeMetricKey,
  type HomeMetricSetting,
} from "@/server/ops-store";
import { recordAudit } from "@/server/operations";
import { can, objectFor, type StaffActor } from "@/server/rbac/decide";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const metricIcons = ["thermo", "drop", "wind", "radiation", "co2", "organics", "climate", "leak"] as const;

export { homeMetricCatalog, homeMetricKeys, metricIcons, metricsSettingsFor };

function denied(status = 403): Failure {
  return { ok: false, status, message: "Нет доступа" };
}

function isKey(value: unknown): value is HomeMetricKey {
  return typeof value === "string" && (homeMetricKeys as readonly string[]).includes(value);
}

function cleanColor(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Выберите цвет" };
  const color = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(color)) return { ok: false, status: 400, message: "Цвет в формате #RRGGBB" };
  return color;
}

function cleanLabel(value: unknown, fallback: string): string | Failure {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите название показателя" };
  const label = value.trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, status: 400, message: "Введите название показателя" };
  if (label.length > 24) return { ok: false, status: 400, message: "Слишком длинное название" };
  return label;
}

export function saveHomeMetricsFor(
  actor: StaffActor,
  input: { objectId?: unknown; items?: unknown },
): Success<{ items: HomeMetricSetting[] }> | Failure {
  if (!can(actor, "settings.edit")) return denied();
  const owned = objectFor(actor, input.objectId, "whole");
  if (!owned.ok) return owned;
  if (!Array.isArray(input.items)) return { ok: false, status: 400, message: "Добавьте показатели" };
  const next: HomeMetricSetting[] = [];
  const seen = new Set<HomeMetricKey>();
  for (const [index, raw] of input.items.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isKey(row.key)) return { ok: false, status: 400, message: "Неизвестный показатель" };
    if (seen.has(row.key)) continue;
    const catalog = homeMetricCatalog[row.key];
    const label = cleanLabel(row.label, catalog.label);
    if (typeof label !== "string") return label;
    const icon = typeof row.icon === "string" && (metricIcons as readonly string[]).includes(row.icon) ? row.icon : catalog.icon;
    const color = cleanColor(row.color ?? catalog.color);
    if (typeof color !== "string") return color;
    seen.add(row.key);
    next.push({
      key: row.key,
      label,
      icon,
      color,
      enabled: row.enabled !== false,
      sort: typeof row.sort === "number" && Number.isFinite(row.sort) ? row.sort : (index + 1) * 10,
    });
  }
  if (!next.length) return { ok: false, status: 400, message: "Добавьте показатели" };
  const file = readOps();
  file.homeMetrics = file.homeMetrics.filter((item) => item.objectId !== owned.value.id);
  file.homeMetrics.push({ objectId: owned.value.id, companyId: owned.value.companyId, items: next });
  writeOps(file);
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: owned.value.id,
    action: "HOME_METRICS",
    targetType: "home",
    targetId: owned.value.id,
    target: "Показатели",
  });
  return { ok: true, value: { items: next.sort((left, right) => left.sort - right.sort) } };
}

export function metricsEditorFor(objectId: string) {
  const items = metricsSettingsFor(objectId);
  const used = new Set(items.map((item) => item.key));
  return {
    items,
    available: homeMetricKeys.filter((key) => !used.has(key)).map((key) => ({ key, ...homeMetricCatalog[key] })),
    catalog: homeMetricKeys.map((key) => ({ key, ...homeMetricCatalog[key] })),
    defaults: defaultMetricItems(),
  };
}
