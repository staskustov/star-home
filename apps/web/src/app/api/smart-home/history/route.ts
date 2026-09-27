import { jsonRpc } from "@/server/rpc";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return jsonRpc("smartHomeHistory", { deviceId: query.get("deviceId"), capability: query.get("capability") ?? undefined, since: query.get("since") ?? undefined });
}
