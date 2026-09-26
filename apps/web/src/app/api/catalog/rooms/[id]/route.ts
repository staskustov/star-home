import { jsonRpc } from "@/server/rpc";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return jsonRpc("updateRoom", { ...(body ?? {}), roomId: id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("removeRoom", { roomId: id });
}
