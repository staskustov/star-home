import { jsonRpc } from "@/server/rpc";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  return jsonRpc("updateUnit", { unitId: id, name: body?.name });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("removeUnit", { unitId: id });
}
