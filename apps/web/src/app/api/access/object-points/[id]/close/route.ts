import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
  return jsonRpc("closeObjectPoint", { objectId: body?.objectId, pointId: id });
}
