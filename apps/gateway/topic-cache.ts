import { groupWirenboardControls, type WbDiscoveredDevice, type WbTopicValue } from "./wb-controls";

export type TopicCache = {
  ingest(topic: string, payload: unknown): { duplicate: boolean; seq: number; topics: WbTopicValue[] };
  snapshot(): WbTopicValue[];
  devices(): WbDiscoveredDevice[];
  size(): number;
  seq(topic: string): number;
  waitFor(
    topic: string,
    match: (value: unknown) => boolean,
    timeoutMs: number,
    afterSeq?: number,
    signal?: AbortSignal,
  ): Promise<unknown | undefined>;
};

type Waiter = {
  topic: string;
  afterSeq: number;
  match: (value: unknown) => boolean;
  finish: (value: unknown | undefined) => void;
};

function payloadKey(payload: unknown): string {
  if (payload === undefined) return "";
  if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function createTopicCache(): TopicCache {
  const values = new Map<string, unknown>();
  const seen = new Map<string, string>();
  const seqs = new Map<string, number>();
  const waiters: Waiter[] = [];

  function snapshot(): WbTopicValue[] {
    return [...values.entries()].map(([topic, value]) => ({ topic, value }));
  }

  function notify(topic: string, seq: number, value: unknown): void {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (!waiter || waiter.topic !== topic || seq <= waiter.afterSeq) continue;
      if (!waiter.match(value)) continue;
      waiters.splice(index, 1);
      waiter.finish(value);
    }
  }

  return {
    ingest(topic, payload) {
      const seq = (seqs.get(topic) ?? 0) + 1;
      seqs.set(topic, seq);
      const key = payloadKey(payload);
      const duplicate = seen.get(topic) === key;
      if (!duplicate) {
        seen.set(topic, key);
        values.set(topic, payload);
      }
      const value = duplicate ? (values.get(topic) ?? payload) : payload;
      notify(topic, seq, value);
      return { duplicate, seq, topics: snapshot() };
    },
    snapshot,
    devices: () => groupWirenboardControls(snapshot()),
    size: () => values.size,
    seq: (topic) => seqs.get(topic) ?? 0,
    waitFor(topic, match, timeoutMs, afterSeq, signal) {
      const minSeq = afterSeq ?? seqs.get(topic) ?? 0;
      return new Promise((resolve) => {
        let settled = false;
        const settle = (value: unknown | undefined) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(value);
        };
        const waiter: Waiter = { topic, afterSeq: minSeq, match, finish: settle };
        const onAbort = () => settle(undefined);
        const timer = setTimeout(() => settle(undefined), Math.max(1, timeoutMs));
        if (signal?.aborted) {
          settle(undefined);
          return;
        }
        waiters.push(waiter);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}
