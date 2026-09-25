import { jsonRpc } from "@/server/rpc";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return jsonRpc("updateAccessPoint", { ...(body ?? {}), pointId: id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
  return jsonRpc("removeAccessPoint", { objectId: body?.objectId, pointId: id });
}
