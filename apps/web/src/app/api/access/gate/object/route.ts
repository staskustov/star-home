import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
  return jsonRpc("openObjectGate", { objectId: body?.objectId });
}
