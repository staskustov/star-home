import { appendAudit, listAudit } from "@/server/audit-store";
import { findCompany } from "@/server/catalog-store";
import { modesForObject } from "@/server/life-mode-store";
import { listUsers } from "@/server/people-store";
import { readOps, writeOps } from "@/server/ops-store";
import { boundValue, forgetStores, remember, storeNames } from "@/server/store-bind";
import { can, type StaffActor } from "@/server/rbac/decide";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };
const snapshotNames = ["catalog", "people", "ops", "life", "audit"] as const;
export type SnapshotName = (typeof snapshotNames)[number];

export type BackupFile = {
  kind: "star-home-backup";
  version: 1;
  at: string;
  names: SnapshotName[];
  snapshots: Record<SnapshotName, unknown>;
};

const restorePhrase = "RESTORE";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hydrate(): void {
  readOps();
  findCompany("");
  listUsers();
  listAudit();
  modesForObject("");
}

function take(name: SnapshotName): unknown {
  const bound = boundValue(name);
  return bound == null ? null : clone(bound);
}

export function restoreAllowed(): boolean {
  return process.env.STAR_HOME_ALLOW_RESTORE === "1";
}

function platformAdmin(actor: StaffActor): boolean {
  return actor.role === "SUPER_ADMIN";
}

function withoutSecrets(name: SnapshotName, body: unknown): unknown {
  if (name === "people") {
    const people = body as { users?: Record<string, unknown>[] };
    for (const user of people.users ?? []) delete user.passwordHash;
  }
  if (name === "ops") {
    const ops = body as { cameraMedia?: Record<string, unknown>[]; pushDevices?: unknown[]; pendingSmart?: unknown[] };
    for (const media of ops.cameraMedia ?? []) delete media.password;
    ops.pushDevices = [];
    ops.pendingSmart = [];
  }
  return body;
}

function keepSecrets(name: SnapshotName, body: unknown): unknown {
  if (name === "people") {
    const current = new Map(listUsers().map((user) => [user.id, user.passwordHash]));
    const people = body as { users?: { id: string; passwordHash?: string }[] };
    for (const user of people.users ?? []) {
      if (!user.passwordHash) user.passwordHash = current.get(user.id) ?? "!";
    }
  }
  if (name === "ops") {
    const live = readOps();
    const ops = body as { cameraMedia?: { deviceId: string; password?: string | null }[]; pushDevices?: unknown[] };
    for (const media of ops.cameraMedia ?? []) {
      if (!media.password) media.password = live.cameraMedia.find((item) => item.deviceId === media.deviceId)?.password ?? null;
    }
    if (!ops.pushDevices?.length) ops.pushDevices = live.pushDevices ?? [];
  }
  return body;
}

export function exportBackup(actor: StaffActor): Result<BackupFile> {
  if (!can(actor, "audit.export") || !platformAdmin(actor)) return denied;
  hydrate();
  const snapshots = {} as Record<SnapshotName, unknown>;
  for (const name of snapshotNames) {
    const body = take(name);
    if (!body || typeof body !== "object") return { ok: false, status: 500, message: "Снимок не собран" };
    snapshots[name] = withoutSecrets(name, body);
  }
  appendAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: null,
    action: "BACKUP_EXPORT",
    targetType: "snapshot",
    targetId: "ops",
    target: snapshotNames.join(","),
  });
  return {
    ok: true,
    value: { kind: "star-home-backup", version: 1, at: new Date().toISOString(), names: [...snapshotNames], snapshots },
  };
}

function asBackup(input: unknown): Result<BackupFile> {
  if (!input || typeof input !== "object") return { ok: false, status: 400, message: "Нет файла снимка" };
  const row = input as { kind?: unknown; version?: unknown; snapshots?: unknown };
  const snapshots = row.snapshots;
  if (row.kind !== "star-home-backup" || row.version !== 1 || !snapshots || typeof snapshots !== "object") {
    return { ok: false, status: 400, message: "Не тот формат снимка" };
  }
  const bag = snapshots as Record<string, unknown>;
  for (const name of snapshotNames) {
    if (!bag[name] || typeof bag[name] !== "object") return { ok: false, status: 400, message: `Нет снимка ${name}` };
  }
  const ops = bag.ops as { devices?: unknown; gateways?: unknown };
  if (!Array.isArray(ops.devices) || !Array.isArray(ops.gateways)) {
    return { ok: false, status: 400, message: "Снимок ops без устройств" };
  }
  return {
    ok: true,
    value: {
      kind: "star-home-backup",
      version: 1,
      at: typeof (input as { at?: unknown }).at === "string" ? (input as { at: string }).at : new Date().toISOString(),
      names: [...snapshotNames],
      snapshots: {
        catalog: bag.catalog,
        people: bag.people,
        ops: bag.ops,
        life: bag.life,
        audit: bag.audit,
      },
    },
  };
}

export function restoreBackup(actor: StaffActor, input: { confirm?: unknown; backup?: unknown }): Result<{ restored: SnapshotName[] }> {
  if (!can(actor, "settings.company.edit") || !platformAdmin(actor)) return denied;
  if (!restoreAllowed()) return { ok: false, status: 403, message: "Восстановление выключено на этом контуре." };
  if (input.confirm !== restorePhrase) return { ok: false, status: 400, message: "Подтвердите RESTORE" };
  const parsed = asBackup(input.backup);
  if (!parsed.ok) return parsed;
  hydrate();
  const prepared = snapshotNames.map((name) => [name, keepSecrets(name, clone(parsed.value.snapshots[name]))] as const);
  for (const [name, body] of prepared) {
    remember(name, body);
  }
  forgetStores([...storeNames]);
  writeOps(readOps());
  appendAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: null,
    action: "BACKUP_RESTORE",
    targetType: "snapshot",
    targetId: "ops",
    target: snapshotNames.join(","),
  });
  return { ok: true, value: { restored: [...snapshotNames] } };
}
