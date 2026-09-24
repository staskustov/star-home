import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown; pointId?: unknown } | null;
  return jsonRpc("openObjectPoint", { objectId: body?.objectId, pointId: body?.pointId });
}
