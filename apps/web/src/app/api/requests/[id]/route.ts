import { jsonRpc } from "@/server/rpc";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown; objectId?: unknown } | null;
  return jsonRpc("setRequestStatus", { id, status: body?.status, objectId: body?.objectId });
}
