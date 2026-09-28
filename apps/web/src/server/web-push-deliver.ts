import webpush from "web-push";
import { unreadNoticeCount } from "@/server/ops-store";
import { pushDevicesOf } from "@/server/push-devices";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export function vapidReady(): boolean {
  return Boolean(process.env.STAR_HOME_VAPID_PUBLIC && process.env.STAR_HOME_VAPID_PRIVATE);
}

export function applyVapid(): void {
  const publicKey = process.env.STAR_HOME_VAPID_PUBLIC;
  const privateKey = process.env.STAR_HOME_VAPID_PRIVATE;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(process.env.STAR_HOME_VAPID_SUBJECT ?? "mailto:star-home@localhost", publicKey, privateKey);
}

export function pushJson(userId: string, title: string, body: string): string {
  const heading = title || "STAR HOME";
  const sos = heading === "SOS";
  return JSON.stringify({
    title: heading,
    body,
    url: sos ? "/security" : "/",
    sos,
    badge: unreadNoticeCount(userId),
  });
}

export function mergeTargets(fromDb: PushTarget[], userId: string): PushTarget[] {
  const seen = new Set<string>();
  const targets: PushTarget[] = [];
  for (const row of [...fromDb, ...pushDevicesOf(userId)]) {
    if (!row.endpoint || seen.has(row.endpoint)) continue;
    seen.add(row.endpoint);
    targets.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
  }
  return targets;
}

export async function sendToTargets(
  targets: PushTarget[],
  payload: string,
  onGone?: (endpoint: string) => Promise<void>,
): Promise<void> {
  if (!vapidReady() || targets.length === 0) return;
  applyVapid();
  await Promise.all(
    targets.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if ((status === 404 || status === 410) && onGone) await onGone(subscription.endpoint);
      }
    }),
  );
}
