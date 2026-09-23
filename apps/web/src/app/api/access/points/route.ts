import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pointId?: unknown } | null;
  return jsonRpc("openPoint", body);
}
