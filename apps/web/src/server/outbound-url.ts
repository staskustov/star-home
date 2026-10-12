import { isIP } from "net";
import { productionRuntime } from "@/server/runtime-mode";

function privateV4(host: string): boolean {
  const [a = 0, b = 0] = host.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateV6(host: string): boolean {
  const value = host.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  return mapped ? privateV4(mapped[1] ?? "") : false;
}

export function publicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !productionRuntime())) return false;
  if (!productionRuntime()) return true;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    return false;
  }
  const family = isIP(host);
  if (family === 4) return !privateV4(host);
  if (family === 6) return !privateV6(host);
  return host.includes(".");
}
