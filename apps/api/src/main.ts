import "reflect-metadata";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { execFileSync, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import net from "net";
import path from "path";
import { Body, Controller, Get, Module, Post, Req, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import EmbeddedPostgres from "embedded-postgres";
import Redis from "ioredis";
import webpush from "web-push";
import { WebSocketServer, type WebSocket } from "ws";
import { intentFromPrompt } from "../../web/src/server/ai-intent";
import { bindFiles, bindLive, bindPush, bindStore, storesFlushed } from "../../web/src/server/store-bind";
import { freshRpc, internalSecret } from "../../web/src/server/internal-secret";
import { readLiveToken } from "../../web/src/server/live-token";
import { bindLoginLimit } from "../../web/src/server/login-limit";
import { projectSnapshot } from "../../web/src/server/persistence/project";

const port = Number(process.env.PORT ?? 3457);
const host = process.env.HOST ?? "127.0.0.1";
const pgPort = 54329;
const dataDir = path.join(process.cwd(), ".data");
const secret = internalSecret;

type LiveClient = WebSocket & { objectId?: string };

let handle: ((method: string, input: unknown, session: { userId: string; membershipId: string | null } | null, client?: unknown) => Promise<{ status: number; body: unknown }>) | null = null;

function signaturesMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function modelReply(prompt: string): { tool: string | null; query: string | null; mode: string | null; reply: string } {
  const intent = intentFromPrompt(prompt);
  return { tool: intent.tool, query: intent.query, mode: intent.mode, reply: intent.reply };
}

@Controller()
class GatewayController {
  @Get("health")
  health(@Res() res: Response): void {
    res.status(handle ? 200 : 503).json({ ok: Boolean(handle) });
  }

  @Post("rpc")
  rpc(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed(null, req, res);
  }

  @Post("auth")
  auth(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("login", req, res);
  }

  @Post("users")
  users(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("residents", req, res);
  }

  @Post("companies")
  companies(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("admin", req, res);
  }

  @Post("objects")
  objects(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("admin", req, res);
  }

  @Post("buildings")
  buildings(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("tree", req, res);
  }

  @Post("units")
  units(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("tree", req, res);
  }

  @Post("residents")
  residents(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("residents", req, res);
  }

  @Post("access")
  access(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("access", req, res);
  }

  @Post("visitors")
  visitors(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("access", req, res);
  }

  @Post("security")
  security(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("desk", req, res, { section: "security" });
  }

  @Post("devices")
  devices(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("desk", req, res, { section: "devices" });
  }

  @Post("payments")
  payments(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("desk", req, res, { section: "payments" });
  }

  @Post("service-requests")
  requests(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("requests", req, res);
  }

  @Post("notifications")
  notifications(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("profile", req, res);
  }

  @Post("ai")
  ai(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    return signed("ask", req, res);
  }

  @Post("bank/charge")
  bank(@Body() body: { reference?: string }, @Res() res: Response): void {
    res.json({ confirmed: true, reference: `bank_${body?.reference ?? "local"}` });
  }

  @Post("model")
  model(@Body() body: { prompt?: string }, @Res() res: Response): void {
    res.json(modelReply(typeof body?.prompt === "string" ? body.prompt : ""));
  }

  @Post("device")
  device(@Res() res: Response): void {
    res.json({ confirmed: true });
  }
}

@Module({ controllers: [GatewayController] })
class AppModule {}

async function signed(method: string | null, req: RawBodyRequest<Request>, res: Response, fixed?: Record<string, unknown>): Promise<void> {
  const raw = req.rawBody;
  const header = req.header("x-star-home-signature") ?? "";
  if (!raw || !handle) {
    res.status(503).json({ message: "Не удалось подтвердить выполнение." });
    return;
  }
  const expected = createHmac("sha256", secret()).update(raw).digest("hex");
  if (!signaturesMatch(header, expected)) {
    res.status(401).json({ message: "Нужно войти" });
    return;
  }
  const payload = JSON.parse(raw.toString("utf8")) as {
    method?: string;
    input?: unknown;
    session?: { userId: string; membershipId: string | null } | null;
    client?: unknown;
    at?: unknown;
  };
  if (!freshRpc(payload.at)) {
    res.status(401).json({ message: "Нужно войти" });
    return;
  }
  const input = fixed ? { ...(typeof payload.input === "object" && payload.input ? payload.input : {}), ...fixed } : payload.input;
  const result = await handle(method ?? payload.method ?? "", input, payload.session ?? null, payload.client);
  res.status(result.status).json(result.body);
}

function waitForPort(target: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const socket = net.connect(target, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        tries += 1;
        if (tries > 50) reject(new Error("PostgreSQL не открыл порт"));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

type Bus = {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  del(key: string): Promise<void>;
  pexpire(key: string, ms: number): Promise<void>;
  publish(message: string): void;
  onMessage(listener: (message: string) => void): void;
};

async function redisBus(url: string): Promise<Bus> {
  const redis = new Redis(url);
  const subscriber = new Redis(url);
  await subscriber.subscribe("star-live");
  return {
    get: (key) => redis.get(key),
    incr: (key) => redis.incr(key),
    del: async (key) => {
      await redis.del(key);
    },
    pexpire: async (key, ms) => {
      await redis.pexpire(key, ms);
    },
    publish: (message) => void redis.publish("star-live", message),
    onMessage: (listener) => subscriber.on("message", (_channel, message) => listener(message)),
  };
}

function memoryBus(): Bus {
  const values = new Map<string, { value: number; until: number }>();
  const listeners: ((message: string) => void)[] = [];
  const read = (key: string) => {
    const entry = values.get(key);
    if (entry && entry.until <= Date.now()) values.delete(key);
    return values.get(key);
  };
  return {
    get: async (key) => {
      const entry = read(key);
      return entry ? String(entry.value) : null;
    },
    incr: async (key) => {
      const entry = read(key) ?? { value: 0, until: Number.POSITIVE_INFINITY };
      entry.value += 1;
      values.set(key, entry);
      return entry.value;
    },
    del: async (key) => {
      values.delete(key);
    },
    pexpire: async (key, ms) => {
      const entry = read(key);
      if (entry) entry.until = Date.now() + ms;
    },
    publish: (message) => {
      for (const listener of listeners) listener(message);
    },
    onMessage: (listener) => {
      listeners.push(listener);
    },
  };
}

async function startRedis(): Promise<string | null> {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  if (process.env.NODE_ENV === "production") return null;
  const probe = new Redis("redis://127.0.0.1:6379", { connectTimeout: 300, maxRetriesPerRequest: 1, lazyConnect: true, retryStrategy: () => null });
  try {
    await probe.connect();
    await probe.ping();
    probe.disconnect();
    return "redis://127.0.0.1:6379";
  } catch {
    probe.disconnect();
  }
  const redisDir = path.join(dataDir, "redis");
  mkdirSync(redisDir, { recursive: true });
  const binary = existsSync(path.join(dataDir, "bin/redis-server")) ? path.join(dataDir, "bin/redis-server") : "redis-server";
  const child = spawn(
    binary,
    ["--bind", "127.0.0.1", "--port", "6379", "--save", "", "--appendonly", "no", "--dir", redisDir, "--daemonize", "no"],
    { stdio: "ignore" },
  );
  child.on("error", (error) => {
    console.error(error);
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("redis://127.0.0.1:6379"), 400);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Redis завершился с кодом ${code ?? "unknown"}`));
    });
  });
}

async function postgres(): Promise<string> {
  mkdirSync(dataDir, { recursive: true });
  const databaseDir = path.join(dataDir, "pg");
  const engine = new EmbeddedPostgres({
    databaseDir,
    user: "star",
    password: "star",
    port: pgPort,
    persistent: true,
  });
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await engine.initialise();
  await engine.start();
  await waitForPort(pgPort);
  try {
    await engine.createDatabase("starhome");
  } catch {
    // The database already exists after the first boot.
  }
  return `postgresql://star:star@127.0.0.1:${pgPort}/starhome`;
}

async function pushSchema(databaseUrl: string): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      execFileSync(path.join(process.cwd(), "node_modules/.bin/prisma"), ["db", "push", "--skip-generate", "--accept-data-loss"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "inherit",
      });
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw last;
}

function vapid(): { publicKey: string; privateKey: string } {
  if (process.env.STAR_HOME_VAPID_PUBLIC && process.env.STAR_HOME_VAPID_PRIVATE) {
    return { publicKey: process.env.STAR_HOME_VAPID_PUBLIC, privateKey: process.env.STAR_HOME_VAPID_PRIVATE };
  }
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "vapid.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys));
  return keys;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? (await postgres());
  process.env.DATABASE_URL = databaseUrl;
  if (!process.env.STAR_HOME_SKIP_DB_PUSH) await pushSchema(databaseUrl);
  const prisma = new PrismaClient();
  await prisma.$connect();

  const redisUrl = await startRedis();
  const bus = redisUrl ? await redisBus(redisUrl) : memoryBus();

  const memory = new Map<string, unknown>();
  const rows = await prisma.snapshot.findMany();
  for (const row of rows) memory.set(row.id, row.body);
  bindStore({
    load(name) {
      return memory.has(name) ? memory.get(name) : undefined;
    },
    save(name, value) {
      const snapshot = JSON.parse(JSON.stringify(value)) as {
        meters?: { id: string; companyId: string; objectId: string; unitId: string; name: string; unit: string }[];
        meterReadings?: { id: string; meterId: string; value: number; at: string }[];
      };
      memory.set(name, snapshot);
      return prisma.snapshot
        .upsert({ where: { id: name }, create: { id: name, body: snapshot, version: 1 }, update: { body: snapshot, version: { increment: 1 } } })
        .then(async (row) => {
          await projectSnapshot(prisma, name, snapshot);
          await prisma.snapshot.updateMany({ where: { id: name, projected: { lt: row.version } }, data: { projected: row.version } });
        });
    },
  });

  bindLoginLimit(async (action, login) => {
    const key = `login:${login.toLowerCase()}`;
    if (action === "check") return Number((await bus.get(key)) ?? 0) >= 8;
    if (action === "clear") {
      await bus.del(key);
      return false;
    }
    const count = await bus.incr(key);
    if (count === 1) await bus.pexpire(key, 10 * 60 * 1000);
    return count >= 8;
  });

  const clients = new Set<LiveClient>();
  bindLive((event) => {
    bus.publish(JSON.stringify(event));
  });
  bus.onMessage((message) => {
    const event = JSON.parse(message) as { objectId?: string };
    const payload = message;
    for (const client of clients) {
      if (client.readyState === client.OPEN && client.objectId === event.objectId) client.send(payload);
    }
  });

  const keys = vapid();
  process.env.STAR_HOME_VAPID_PUBLIC = keys.publicKey;
  webpush.setVapidDetails(process.env.STAR_HOME_VAPID_SUBJECT ?? "mailto:star-home@localhost", keys.publicKey, keys.privateKey);
  const pushRuntime = globalThis as typeof globalThis & {
    __starSavePush?: (row: { userId: string; endpoint: string; p256dh: string; auth: string }) => Promise<void>;
  };
  pushRuntime.__starSavePush = async (row) => {
    await prisma.pushSubscription.upsert({
      where: { endpoint: row.endpoint },
      create: { id: `push_${randomBytes(8).toString("hex")}`, ...row },
      update: { userId: row.userId, p256dh: row.p256dh, auth: row.auth },
    });
  };
  bindPush(async (userId, body, title) => {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    const heading = title || "STAR HOME";
    const sos = heading === "SOS";
    await Promise.all(
      subscriptions.map((subscription) =>
        webpush
          .sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            JSON.stringify({ title: heading, body, url: sos ? "/security" : "/", sos }),
          )
          .catch(() => undefined),
      ),
    );
  });

  bindFiles(async (input) => {
    const safe = input.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
    const id = randomBytes(8).toString("hex");
    let storedPath = "";
    if (process.env.STAR_HOME_S3_ENDPOINT) {
      const key = `${input.companyId}/${id}_${safe}`;
      const url = `${process.env.STAR_HOME_S3_ENDPOINT.replace(/\/$/, "")}/${key}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          ...(process.env.STAR_HOME_S3_TOKEN ? { authorization: `Bearer ${process.env.STAR_HOME_S3_TOKEN}` } : {}),
        },
        body: new Uint8Array(input.bytes),
      });
      if (!response.ok) return safe;
      storedPath = key;
    } else {
      const dir = path.join(dataDir, "files", input.companyId);
      mkdirSync(dir, { recursive: true });
      storedPath = path.join(dir, `${id}_${safe}`);
      writeFileSync(storedPath, input.bytes);
    }
    await prisma.storedFile.create({
      data: { id, companyId: input.companyId, objectId: "", requestId: null, name: safe, path: storedPath },
    });
    return safe;
  });

  process.env.STAR_HOME_BANK_URL ||= `http://127.0.0.1:${port}/bank/charge`;
  process.env.STAR_HOME_LLM_URL ||= `http://127.0.0.1:${port}/model`;

  const domain = await import("../../web/src/server/rpc-handlers");
  const people = await import("../../web/src/server/people-store");
  const ops = await import("../../web/src/server/ops-store");
  const catalog = await import("../../web/src/server/catalog-store");
  const life = await import("../../web/src/server/life-mode-store");
  people.listUsers();
  ops.readOps();
  catalog.findCompany("cmp_star");
  life.modesForObject("obj_siyanie");
  life.modesForObject("obj_park");
  life.modesForObject("obj_sky");
  await storesFlushed();
  for (const [name, body] of memory) await projectSnapshot(prisma, name, body);
  handle = domain.handleRpc;

  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ["error", "warn", "log"] });
  await app.listen(port, host);
  const sockets = new WebSocketServer({ server: app.getHttpServer(), path: "/live" });
  sockets.on("connection", (socket, request) => {
    const token = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("token") ?? "";
    const live = readLiveToken(token);
    if (!live) {
      socket.close();
      return;
    }
    const client = socket as LiveClient;
    client.objectId = live.objectId;
    clients.add(client);
    client.on("close", () => clients.delete(client));
  });
  console.log(`STAR HOME API http://127.0.0.1:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
