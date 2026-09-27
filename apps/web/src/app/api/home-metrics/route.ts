import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown; items?: unknown } | null;
  return jsonRpc("saveHomeMetrics", { objectId: body?.objectId, items: body?.items });
}
