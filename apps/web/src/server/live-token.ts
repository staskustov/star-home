import { createHmac, timingSafeEqual } from "crypto";
import { internalSecret } from "@/server/internal-secret";

export function signLiveToken(userId: string, objectId: string, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ userId, objectId, exp: Date.now() + ttlMs })).toString("base64url");
  const signature = createHmac("sha256", internalSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readLiveToken(token: string): { objectId: string } | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", internalSecret()).update(body).digest("base64url"));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { objectId?: string; exp?: number };
    if (!payload.objectId || !payload.exp || payload.exp < Date.now()) return null;
    return { objectId: payload.objectId };
  } catch {
    return null;
  }
}
