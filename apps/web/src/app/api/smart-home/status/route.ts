import { jsonRpc } from "@/server/rpc";

export async function GET(request: Request) {
  const objectId = new URL(request.url).searchParams.get("objectId");
  return jsonRpc("smartHomeStatus", { objectId });
}
