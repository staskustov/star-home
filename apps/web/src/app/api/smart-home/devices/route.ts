import { jsonRpc } from "@/server/rpc";

export async function GET(request: Request) {
  const objectId = new URL(request.url).searchParams.get("objectId");
  return jsonRpc("smartHomeDevices", { objectId });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return jsonRpc("registerDevice", body);
}
