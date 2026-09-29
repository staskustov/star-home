import type { ApplyCommand, ApplyResult } from "./apply";

export type CameraCaptureMedia = {
  protocol?: string;
  host?: string | null;
  port?: number | null;
  path?: string | null;
  snapshotUrl?: string | null;
  username?: string | null;
  password?: string | null;
};

export const jpegMaxBytes = 400_000;

export function isJpegBytes(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function basicAuth(username?: string | null, password?: string | null): Record<string, string> {
  if (!username) return {};
  return { authorization: `Basic ${Buffer.from(`${username}:${password ?? ""}`).toString("base64")}` };
}

function mediaUrl(host: string, port: number | null | undefined, path: string | null | undefined, fallbackPort: number): string {
  const portPart = port && port !== 80 && port !== 443 ? `:${port}` : port ? `:${port}` : `:${fallbackPort}`;
  const suffix = path?.startsWith("/") ? path : path ? `/${path}` : "";
  return `http://${host}${portPart}${suffix}`;
}

function snapshotFromValue(value: CameraCaptureMedia): string | null {
  if (typeof value.snapshotUrl === "string" && /^https?:\/\//i.test(value.snapshotUrl)) return value.snapshotUrl;
  if (value.protocol === "http-snapshot" && value.host) {
    return mediaUrl(value.host, value.port, value.path, 80);
  }
  return null;
}

async function readJpeg(url: string, headers: Record<string, string>, fetchHttp: typeof fetch): Promise<Buffer | null> {
  const response = await fetchHttp(url, { headers, redirect: "follow" }).catch(() => null);
  if (!response?.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isJpegBytes(bytes) || bytes.length < 32 || bytes.length > jpegMaxBytes) return null;
  return bytes;
}

function xmlText(xml: string, tag: string): string | null {
  const match = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([^<]+)</(?:[\\w-]+:)?${tag}>`, "i").exec(xml);
  return match?.[1]?.trim() || null;
}

function profileToken(xml: string): string | null {
  const tagged = xmlText(xml, "token") ?? xmlText(xml, "ProfileToken");
  if (tagged) return tagged;
  const attr = /<(?:[\w-]+:)?Profiles?\b[^>]*\btoken="([^"]+)"/i.exec(xml);
  return attr?.[1] ?? null;
}

export async function onvifSnapshotUrl(
  media: CameraCaptureMedia,
  fetchHttp: typeof fetch,
): Promise<string | null> {
  if (!media.host) return null;
  const url = mediaUrl(media.host, media.port, "/onvif/media_service", 80);
  const headers = { "content-type": "application/soap+xml", ...basicAuth(media.username, media.password) };
  const profiles = await fetchHttp(url, {
    method: "POST",
    headers,
    body: `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl"><s:Body><trt:GetProfiles/></s:Body></s:Envelope>`,
  }).catch(() => null);
  if (!profiles?.ok) return null;
  const profileXml = await profiles.text();
  const token = profileToken(profileXml);
  if (!token) return null;
  const shot = await fetchHttp(url, {
    method: "POST",
    headers,
    body: `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl"><s:Body><trt:GetSnapshotUri><trt:ProfileToken>${token}</trt:ProfileToken></s:Body></s:Envelope>`,
  }).catch(() => null);
  if (!shot?.ok) return null;
  const uri = xmlText(await shot.text(), "Uri");
  return uri && /^https?:\/\//i.test(uri) ? uri : null;
}

export async function captureCameraFrame(
  command: ApplyCommand,
  fetchHttp: typeof fetch = fetch,
): Promise<ApplyResult & { frame?: string }> {
  const value = (command.value && typeof command.value === "object" ? command.value : {}) as CameraCaptureMedia;
  if (value.protocol === "rtsp" && !value.snapshotUrl) {
    return { confirmed: false, error: "rtsp-live-unsupported" };
  }
  let snapshot = snapshotFromValue(value);
  if (!snapshot && value.protocol === "onvif") {
    snapshot = await onvifSnapshotUrl(value, fetchHttp);
  }
  if (!snapshot) return { confirmed: false, error: "camera-unconfigured" };
  const jpeg = await readJpeg(snapshot, basicAuth(value.username, value.password), fetchHttp);
  if (!jpeg) return { confirmed: false, sent: true, error: "not-jpeg" };
  return { confirmed: true, sent: true, frame: jpeg.toString("base64") };
}
