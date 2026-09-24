export const rpcClockSkewMs = 60_000;

export function internalSecret(): string {
  const value = process.env.STAR_HOME_INTERNAL_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("STAR_HOME_INTERNAL_SECRET is required");
  return "star-home-dev-internal";
}

export function freshRpc(at: unknown, now = Date.now()): boolean {
  return typeof at === "number" && Number.isFinite(at) && Math.abs(now - at) <= rpcClockSkewMs;
}
