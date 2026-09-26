import { jsonRpc } from "@/server/rpc";

export async function GET(request: Request) {
  const objectId = new URL(request.url).searchParams.get("objectId");
  return jsonRpc("listScenarios", { objectId });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return jsonRpc("createScenario", body);
}
