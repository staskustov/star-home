const unconfirmed = "Не удалось подтвердить выполнение.";

let inflight = 0;

function changed(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("star-command"));
}

export function commandInFlight(): boolean {
  return inflight > 0;
}

export function watchCommands(listener: () => void): () => void {
  window.addEventListener("star-command", listener);
  return () => window.removeEventListener("star-command", listener);
}

export async function runCommand(task: () => Promise<Response>): Promise<{ ok: boolean; payload: Record<string, unknown> | null }> {
  inflight += 1;
  changed();
  try {
    const response = await task();
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, payload };
  } catch {
    return { ok: false, payload: null };
  } finally {
    inflight = Math.max(0, inflight - 1);
    changed();
  }
}

export function commandMessage(payload: Record<string, unknown> | null, fallback = unconfirmed): string {
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.reply === "string") return payload.reply;
  return fallback;
}

export { unconfirmed };
