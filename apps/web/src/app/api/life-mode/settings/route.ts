import { jsonRpc } from "@/server/rpc";

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  return jsonRpc("saveMode", body);
}
