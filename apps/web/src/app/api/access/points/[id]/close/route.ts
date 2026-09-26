import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { pointId?: unknown } | null;
  return jsonRpc("closePoint", { pointId: typeof body?.pointId === "string" ? body.pointId : id });
}
