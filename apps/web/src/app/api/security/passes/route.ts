import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown; code?: unknown } | null;
  return jsonRpc("checkPass", { objectId: body?.objectId, code: body?.code });
}
