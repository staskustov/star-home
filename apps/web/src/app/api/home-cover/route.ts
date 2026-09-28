import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { photo?: unknown; objectId?: unknown; scope?: unknown } | null;
  return jsonRpc("saveHomeCover", { photo: body?.photo, objectId: body?.objectId, scope: body?.scope });
}
