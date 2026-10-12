import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const prefix = "enc1:";

function key(): Buffer {
  const material =
    process.env.STAR_HOME_DATA_KEY ??
    process.env.STAR_HOME_INTERNAL_SECRET ??
    process.env.STAR_HOME_SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "star-home-dev-data");
  if (!material) throw new Error("STAR_HOME_DATA_KEY is required");
  return createHash("sha256").update(`star-home-data:${material}`).digest();
}

export function sealSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith(prefix)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${prefix}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function openSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(prefix)) return value;
  try {
    const raw = Buffer.from(value.slice(prefix.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
