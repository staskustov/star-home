import { jsonRpc } from "@/server/rpc";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("smartHomeDevice", { deviceId: id });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return jsonRpc("updateDevice", { ...(body ?? {}), deviceId: id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("removeDevice", { deviceId: id });
}
