import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown; name?: unknown } | null;
  return jsonRpc("cameraFrame", body);
}
