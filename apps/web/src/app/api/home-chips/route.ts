import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return jsonRpc("saveHomeChip", body ?? {});
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  return jsonRpc("removeHomeChip", body ?? {});
}
