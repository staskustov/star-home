import { jsonRpc } from "@/server/rpc";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("removeBuilding", { buildingId: id });
}
