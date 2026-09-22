import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  return jsonRpc("createBuilding", { objectId: id, name: body?.name });
}
