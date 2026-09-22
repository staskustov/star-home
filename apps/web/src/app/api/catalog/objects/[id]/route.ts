import { jsonRpc } from "@/server/rpc";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("tree", { objectId: id });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; address?: unknown } | null;
  return jsonRpc("updateObject", { objectId: id, name: body?.name, address: body?.address });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("removeObject", { objectId: id });
}
