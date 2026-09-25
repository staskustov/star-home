import { randomBytes } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { after } from "next/server";
import webpush from "web-push";
import type { SessionRef } from "@/server/actor";
import type { ClientInfo } from "@/server/audit-context";
import { bindLoginLimit } from "@/server/login-limit";
import { projectLatest } from "@/server/persistence/project";
import { touchPulse } from "@/server/persistence/pulse";
import { bindFiles, bindLive, bindPush, bindStore, forgetStores, storeNames } from "@/server/store-bind";

type Held = { body: unknown; version: number };

type Embedded = {
  prisma: PrismaClient;
  memory: Map<string, Held>;
  dirty: Set<string>;
  live: Set<string>;
  pending: Promise<unknown>[];
  queue: Promise<unknown>;
  tx: Prisma.TransactionClient | null;
};

const storeLock = 4210;
const loginLimit = 8;
const loginWindowMs = 10 * 60 * 1000;

const state = globalThis as typeof globalThis & {
  __starEmbedded?: Embedded;
  __starSavePush?: (row: { userId: string; endpoint: string; p256dh: string; auth: string }) => Promise<void>;
};

function databaseUrl(): string {
  const raw = process.env.STAR_HOME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required");
  const url = new URL(raw);
  if (url.hostname.includes("-pooler") && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
  return url.toString();
}

function embedded(): Embedded {
  if (state.__starEmbedded) return state.__starEmbedded;
  const runtime: Embedded = {
    prisma: new PrismaClient({ datasourceUrl: databaseUrl() }),
    memory: new Map(),
    dirty: new Set(),
    live: new Set(),
    pending: [],
    queue: Promise.resolve(),
    tx: null,
  };
  const db = () => runtime.tx ?? runtime.prisma;

  bindStore({
    load: (name) => runtime.memory.get(name)?.body,
    save: (name, value) => {
      runtime.memory.set(name, { body: value, version: runtime.memory.get(name)?.version ?? 0 });
      runtime.dirty.add(name);
    },
  });

  bindLive((event) => {
    runtime.live.add(event.objectId);
  });

  bindLoginLimit(async (action, login) => {
    const key = login.toLowerCase();
    if (action === "clear") {
      await db().loginAttempt.deleteMany({ where: { login: key } });
      return false;
    }
    const row = await db().loginAttempt.findUnique({ where: { login: key } });
    const current = row && row.until.getTime() > Date.now() ? row.count : 0;
    if (action === "check") return current >= loginLimit;
    const count = current + 1;
    const until = current === 0 ? new Date(Date.now() + loginWindowMs) : row!.until;
    await db().loginAttempt.upsert({ where: { login: key }, create: { login: key, count, until }, update: { count, until } });
    return count >= loginLimit;
  });

  const publicKey = process.env.STAR_HOME_VAPID_PUBLIC;
  const privateKey = process.env.STAR_HOME_VAPID_PRIVATE;
  if (publicKey && privateKey) {
    webpush.setVapidDetails(process.env.STAR_HOME_VAPID_SUBJECT ?? "mailto:star-home@localhost", publicKey, privateKey);
  }
  state.__starSavePush = async (row) => {
    await db().pushSubscription.upsert({
      where: { endpoint: row.endpoint },
      create: { id: `push_${randomBytes(8).toString("hex")}`, ...row },
      update: { userId: row.userId, p256dh: row.p256dh, auth: row.auth },
    });
  };
  bindPush((userId, body) => {
    if (!publicKey || !privateKey) return;
    const delivery = runtime.prisma.pushSubscription.findMany({ where: { userId } }).then((subscriptions) =>
      Promise.all(
        subscriptions.map((subscription) =>
          webpush
            .sendNotification(
              { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
              JSON.stringify({ title: "STAR HOME", body }),
            )
            .catch(() => undefined),
        ),
      ),
    );
    runtime.pending.push(delivery);
  });

  bindFiles(async (input) => {
    const safe = input.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
    const id = randomBytes(8).toString("hex");
    await db().storedFile.create({
      data: { id, companyId: input.companyId, objectId: "", requestId: null, name: safe, path: `db:${id}`, data: new Uint8Array(input.bytes) },
    });
    return safe;
  });

  state.__starEmbedded = runtime;
  return runtime;
}

async function catchUp(runtime: Embedded, tx: Prisma.TransactionClient): Promise<void> {
  const versions = await tx.snapshot.findMany({ select: { id: true, version: true } });
  const stale = versions.filter((row) => runtime.memory.get(row.id)?.version !== row.version).map((row) => row.id);
  if (stale.length === 0) return;
  const rows = await tx.snapshot.findMany({ where: { id: { in: stale } } });
  for (const row of rows) runtime.memory.set(row.id, { body: row.body, version: row.version });
  forgetStores(stale);
}

async function writeDirty(runtime: Embedded, tx: Prisma.TransactionClient): Promise<string[]> {
  const saved = [...runtime.dirty];
  for (const name of saved) {
    const held = runtime.memory.get(name);
    if (!held) continue;
    const body = JSON.parse(JSON.stringify(held.body)) as Prisma.InputJsonValue;
    const row = await tx.snapshot.upsert({
      where: { id: name },
      create: { id: name, body, version: 1 },
      update: { body, version: { increment: 1 } },
      select: { version: true },
    });
    held.version = row.version;
  }
  return saved;
}

function later(task: () => Promise<unknown>): void {
  const run = () => task().catch((error) => console.error(error));
  try {
    after(run);
  } catch {
    void run();
  }
}

async function execute(
  runtime: Embedded,
  method: string,
  input: unknown,
  session: SessionRef | null,
  client?: ClientInfo,
): Promise<{ status: number; body: unknown }> {
  const { handleRpc } = await import("@/server/rpc-handlers");
  runtime.dirty.clear();
  runtime.live.clear();
  let saved: string[] = [];
  let reply: { status: number; body: unknown };
  try {
    reply = await runtime.prisma.$transaction(
      async (tx) => {
        runtime.tx = tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${storeLock})`;
        await catchUp(runtime, tx);
        const result = await handleRpc(method, input, session, client);
        saved = await writeDirty(runtime, tx);
        return result;
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  } catch (error) {
    runtime.memory.clear();
    forgetStores(storeNames);
    throw error;
  } finally {
    runtime.tx = null;
    runtime.dirty.clear();
  }
  const pending = runtime.pending.splice(0);
  for (const objectId of runtime.live) touchPulse(objectId);
  runtime.live.clear();
  if (saved.length || pending.length) {
    later(async () => {
      await Promise.allSettled(pending);
      if (saved.length) await projectLatest(runtime.prisma, saved);
    });
  }
  return { status: reply.status, body: JSON.parse(JSON.stringify(reply.body ?? null)) };
}

export function embeddedRpc(
  method: string,
  input: unknown,
  session: SessionRef | null,
  client?: ClientInfo,
): Promise<{ status: number; body: unknown }> {
  const runtime = embedded();
  const run = runtime.queue.then(() => execute(runtime, method, input, session, client));
  runtime.queue = run.catch(() => undefined);
  return run;
}
