import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export type OutboundItem = { kind: string; extra: Record<string, unknown> };

export type OutboundBuffer = {
  push(item: OutboundItem): void;
  flush(send: (kind: string, extra: Record<string, unknown>) => Promise<unknown>): Promise<void>;
  size(): number;
  snapshot(): OutboundItem[];
};

const defaultLimit = 500;

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

export function createOutboundBuffer(opts?: { path?: string; limit?: number }): OutboundBuffer {
  const path = opts?.path;
  const limit = opts?.limit ?? defaultLimit;
  let items = load(path).slice(-limit);

  function persist(): void {
    save(path, items);
  }

  return {
    push(item) {
      items.push({ kind: item.kind, extra: item.extra });
      if (items.length > limit) items = items.slice(-limit);
      persist();
    },
    async flush(send) {
      const pending = [...items];
      items = [];
      persist();
      const leftover: OutboundItem[] = [];
      let failed = false;
      for (const item of pending) {
        if (failed) {
          leftover.push(item);
          continue;
        }
        try {
          await send(item.kind, item.extra);
        } catch {
          leftover.push(item);
          failed = true;
        }
      }
      if (leftover.length) {
        items = [...leftover, ...items].slice(-limit);
        persist();
        throw new Error("gateway-buffer-flush-failed");
      }
    },
    size: () => items.length,
    snapshot: () => items.map((item) => ({ ...item, extra: { ...item.extra } })),
  };
}

export function shouldBufferStatus(status: number): boolean {
  return status >= 500 || status === 429;
}
