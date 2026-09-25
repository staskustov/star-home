import { randomBytes } from "crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import { after } from "next/server";

const tagOf = (objectId: string) => `star-live:${objectId}`;

export function readPulse(objectId: string): Promise<string> {
  return unstable_cache(async () => `${Date.now().toString(36)}.${randomBytes(4).toString("hex")}`, ["star-live-pulse", objectId], {
    tags: [tagOf(objectId)],
  })();
}

export function touchPulse(objectId: string): void {
  try {
    revalidateTag(tagOf(objectId), { expire: 0 });
  } catch {
    try {
      after(() => revalidateTag(tagOf(objectId), { expire: 0 }));
    } catch {
      // Proxy renders cannot revalidate; clients catch up on the next change.
    }
  }
}
