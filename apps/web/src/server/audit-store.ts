import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { auditCategoryOf, type AuditCategory } from "@/server/audit-actions";
import { requestContext } from "@/server/audit-context";
import { readOps } from "@/server/ops-store";
import { boundValue, remember } from "@/server/store-bind";
import type { Role } from "@/types/domain";

export type AuditResult = "SUCCESS" | "DENIED" | "ERROR";

export type AuditChange = { field: string; from: string; to: string };

export type AuditRecord = {
  id: string;
  at: string;
  actorUserId: string;
  actorRole: Role | null;
  membershipId: string | null;
  companyId: string;
  objectId: string | null;
  buildingId: string | null;
  unitId: string | null;
  category: AuditCategory;
  action: string;
  targetType: string;
  targetId: string | null;
  target: string;
  result: AuditResult;
  reason: string;
  ip: string | null;
  device: string | null;
  changes?: AuditChange[];
};

export type AuditInput = {
  actorUserId: string;
  companyId: string;
  objectId?: string | null;
  buildingId?: string | null;
  unitId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string | null;
  target: string;
  result?: AuditResult;
  reason?: string;
  actorRole?: Role | null;
  changes?: AuditChange[];
};

type AuditFile = { entries: AuditRecord[]; migrated: boolean };

export const auditWindow = 5000;

const filePath = path.join(process.cwd(), "data", "audit.json");
const globalStore = globalThis as typeof globalThis & { __starHomeAudit?: AuditFile };

function legacyTime(at: string): string {
  const match = at.match(/^(\d{2})\.(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return new Date(0).toISOString();
  const [, day, month, hours, minutes] = match;
  return new Date(new Date().getFullYear(), Number(month) - 1, Number(day), Number(hours), Number(minutes)).toISOString();
}

function migrate(file: AuditFile): AuditFile {
  if (file.migrated) return file;
  const known = new Set(file.entries.map((entry) => entry.id));
  for (const entry of readOps().audit) {
    if (known.has(entry.id)) continue;
    file.entries.push({
      id: entry.id,
      at: legacyTime(entry.at),
      actorUserId: entry.actorUserId,
      actorRole: null,
      membershipId: null,
      companyId: entry.companyId,
      objectId: entry.objectId || null,
      buildingId: null,
      unitId: null,
      category: auditCategoryOf(entry.action) ?? "DATA",
      action: entry.action,
      targetType: "legacy",
      targetId: null,
      target: entry.target,
      result: entry.result,
      reason: entry.error,
      ip: null,
      device: null,
    });
  }
  file.entries.sort((left, right) => right.at.localeCompare(left.at));
  file.migrated = true;
  persist(file);
  return file;
}

function load(): AuditFile {
  if (globalStore.__starHomeAudit) return globalStore.__starHomeAudit;
  const bound = boundValue("audit") as AuditFile | undefined;
  const stored = bound ?? (existsSync(filePath) ? (JSON.parse(readFileSync(filePath, "utf8")) as AuditFile) : null);
  const file: AuditFile = { entries: stored?.entries ?? [], migrated: stored?.migrated ?? false };
  globalStore.__starHomeAudit = file;
  return migrate(file);
}

function persist(file: AuditFile): void {
  globalStore.__starHomeAudit = file;
  if (remember("audit", file)) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(file));
}

export function appendAudit(input: AuditInput): AuditRecord {
  const file = load();
  const context = requestContext();
  const actor = context?.actor?.userId === input.actorUserId ? context.actor : null;
  const entry: AuditRecord = {
    id: `audit_${randomBytes(8).toString("hex")}`,
    at: new Date().toISOString(),
    actorUserId: input.actorUserId,
    actorRole: input.actorRole ?? actor?.role ?? null,
    membershipId: actor?.membershipId ?? null,
    companyId: input.companyId,
    objectId: input.objectId || null,
    buildingId: input.buildingId || null,
    unitId: input.unitId || null,
    category: auditCategoryOf(input.action) ?? "DATA",
    action: input.action,
    targetType: input.targetType ?? "",
    targetId: input.targetId ?? null,
    target: input.target.slice(0, 240),
    result: input.result ?? "SUCCESS",
    reason: (input.reason ?? "").slice(0, 240),
    ip: context?.client.ip ?? null,
    device: context?.client.device ?? null,
    ...(input.changes?.length ? { changes: input.changes } : {}),
  };
  file.entries.unshift(entry);
  if (file.entries.length > auditWindow) file.entries.length = auditWindow;
  persist(file);
  return entry;
}

export function listAudit(): readonly AuditRecord[] {
  return load().entries;
}
