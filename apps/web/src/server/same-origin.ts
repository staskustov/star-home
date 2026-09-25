const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function publicUrl(request: { url: string; headers: Headers }, path: string) {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    new URL(request.url).host;
  return new URL(path, `${proto}://${host}`);
}

export function crossSiteWrite(method: string, headers: Headers): boolean {
  if (safeMethods.has(method.toUpperCase())) return false;
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  const host = hostOf(origin);
  if (!host) return true;
  return host !== headers.get("host") && host !== headers.get("x-forwarded-host");
}
