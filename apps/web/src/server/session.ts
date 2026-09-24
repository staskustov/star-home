import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const sessionCookie = "star_home_session";

const maxAgeSeconds = 60 * 60 * 24 * 14;

type SessionPayload = {
  userId: string;
  membershipId: string | null;
  sv: number;
  exp: number;
};

function secret(): string {
  const value = process.env.STAR_HOME_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("STAR_HOME_SESSION_SECRET is required");
  }
  return "star-home-dev-session";
}

export function signSession(userId: string, membershipId: string | null, sv = 1): string {
  const payload: SessionPayload = {
    userId,
    membershipId,
    sv,
    exp: Date.now() + maxAgeSeconds * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return {
      userId: payload.userId,
      membershipId: payload.membershipId ?? null,
      sv: typeof payload.sv === "number" ? payload.sv : 1,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(sessionCookie)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
