import { jsonRpc } from "@/server/rpc";

export async function GET(request: Request) {
  const unitId = new URL(request.url).searchParams.get("unitId");
  return jsonRpc("floorPlan", { unitId });
}
