import { jsonRpc } from "@/server/rpc";

export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get("deviceId");
  return jsonRpc("smartHomeHistory", { deviceId });
}
