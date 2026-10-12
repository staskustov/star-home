import { clock, readOps, writeOps, type PushDevice } from "@/server/ops-store";

const pushHosts = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.yandex\.ru$/,
];

export function isPushEndpoint(value: string): boolean {
  if (value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && pushHosts.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export function savePushDevice(row: { userId: string; endpoint: string; p256dh: string; auth: string; device?: string }): void {
  const file = readOps();
  file.pushDevices ??= [];
  const next: PushDevice = {
    userId: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    device: row.device?.trim().slice(0, 80) || undefined,
    at: clock(),
  };
  const index = file.pushDevices.findIndex((item) => item.endpoint === row.endpoint);
  if (index >= 0) file.pushDevices[index] = next;
  else file.pushDevices.push(next);
  file.pushDevices = file.pushDevices.slice(-400);
  writeOps(file);
}

export function pushDeviceByEndpoint(endpoint: string): PushDevice | undefined {
  return (readOps().pushDevices ?? []).find((item) => item.endpoint === endpoint);
}

export function dropPushDevice(userId: string, endpoint: string): boolean {
  const file = readOps();
  const before = file.pushDevices?.length ?? 0;
  file.pushDevices = (file.pushDevices ?? []).filter((item) => !(item.endpoint === endpoint && item.userId === userId));
  if (file.pushDevices.length === before) return false;
  writeOps(file);
  return true;
}

export function pushDevicesOf(userId: string): PushDevice[] {
  return (readOps().pushDevices ?? []).filter((item) => item.userId === userId);
}
