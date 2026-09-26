import { clock, readOps, writeOps, type PushDevice } from "@/server/ops-store";

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

export function pushDevicesOf(userId: string): PushDevice[] {
  return (readOps().pushDevices ?? []).filter((item) => item.userId === userId);
}
