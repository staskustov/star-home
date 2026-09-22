import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, 32).toString("base64url");
  return `${salt}.${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(".");
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(key, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
