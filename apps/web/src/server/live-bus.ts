import { publishLive, type LiveEvent } from "@/server/store-bind";
import { readOps, writeOps } from "@/server/ops-store";

export function emitLive(event: Omit<LiveEvent, "seq" | "at"> & Partial<Pick<LiveEvent, "seq" | "at">>): LiveEvent {
  const file = readOps();
  file.liveSeq ??= {};
  const seq = (file.liveSeq[event.objectId] ?? 0) + 1;
  file.liveSeq[event.objectId] = seq;
  writeOps(file);
  const full: LiveEvent = { ...event, seq, at: event.at ?? new Date().toISOString() };
  publishLive(full);
  return full;
}

export function liveIsNewer(seen: number | undefined, incoming: number): boolean {
  return incoming > (seen ?? 0);
}

export function liveAccept(seen: Set<number>, seq: number): "apply" | "duplicate" | "stale" {
  if (seen.has(seq)) return "duplicate";
  const max = seen.size ? Math.max(...seen) : 0;
  if (seq < max) return "stale";
  seen.add(seq);
  return "apply";
}
