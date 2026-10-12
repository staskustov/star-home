import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "fs";
import { dirname } from "path";

export type OutboundItem = { kind: string; extra: Record<string, unknown>; attempts?: number };

export type OutboundBuffer = {
  push(item: OutboundItem): void;
  flush(send: (kind: string, extra: Record<string, unknown>) => Promise<unknown>): Promise<void>;
  size(): number;
  dropped(): number;
  snapshot(): OutboundItem[];
};

const defaultLimit = 500;
const defaultMaxAttempts = 30;
const bufferedKinds = new Set(["ack", "state", "states", "automation"]);

export function shouldBufferKind(kind: string): boolean {
  return bufferedKinds.has(kind);
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly retry: boolean,
  ) {
    super(message);
  }
}

function load(path: string | undefined): OutboundItem[] {
  if (!path) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as OutboundItem[]).filter((item) => item && typeof item.kind === "string") : [];
  } catch {
    return [];
  }
}

function save(path: string | undefined, items: OutboundItem[]): void {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(items));
  } catch {
    /* disk optional */
  }
}

function deadLetter(path: string | undefined, item: OutboundItem, reason: string): void {
  if (!path) return;
  try {
    appendFileSync(`${path}.dead`, `${JSON.stringify({ at: new Date().toISOString(), reason, item })}\n`);
  } catch {
    /* disk optional */
  }
}

export function createOutboundBuffer(opts?: { path?: string; limit?: number; maxAttempts?: number }): OutboundBuffer {
  const path = opts?.path;
  const limit = opts?.limit ?? defaultLimit;
  const maxAttempts = opts?.maxAttempts ?? defaultMaxAttempts;
  let items = load(path).slice(-limit);
  let flushing: Promise<void> | null = null;
  let droppedCount = 0;

  function persist(): void {
    save(path, items);
  }

  function trim(): void {
    if (items.length <= limit) return;
    const over = items.length - limit;
    for (const item of items.slice(0, over)) deadLetter(path, item, "overflow");
    droppedCount += over;
    items = items.slice(over);
  }

  async function drain(send: (kind: string, extra: Record<string, unknown>) => Promise<unknown>): Promise<void> {
    while (items.length) {
      const item = items[0]!;
      try {
        await send(item.kind, item.extra);
        items.shift();
        persist();
      } catch (error) {
        const retry = !(error instanceof CloudError) || error.retry;
        item.attempts = (item.attempts ?? 0) + 1;
        if (!retry || item.attempts >= maxAttempts) {
          items.shift();
          droppedCount += 1;
          deadLetter(path, item, retry ? "attempts" : error instanceof Error ? error.message : "rejected");
          persist();
          if (!retry) continue;
        }
        persist();
        throw new Error("gateway-buffer-flush-failed");
      }
    }
  }

  return {
    push(item) {
      items.push({ kind: item.kind, extra: item.extra, attempts: item.attempts ?? 0 });
      trim();
      persist();
    },
    async flush(send) {
      if (flushing) return flushing;
      flushing = drain(send).finally(() => {
        flushing = null;
      });
      return flushing;
    },
    size: () => items.length,
    dropped: () => droppedCount,
    snapshot: () => items.map((item) => ({ ...item, extra: { ...item.extra } })),
  };
}

export function shouldBufferStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}
