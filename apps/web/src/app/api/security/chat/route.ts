import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { body?: unknown; objectId?: unknown; unitId?: unknown } | null;
  if (body?.objectId && body.unitId) {
    return jsonRpc("sendSecurityReply", { objectId: body.objectId, unitId: body.unitId, body: body.body });
  }
  return jsonRpc("sendSecurityMessage", { body: body?.body });
}
