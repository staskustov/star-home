import { jsonRpc } from "@/server/rpc";

type Body = { objectId?: unknown; work?: unknown } | null;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as Body;
  return jsonRpc("pollDevice", { objectId: body?.objectId, deviceId: (await params).id });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as Body;
  return jsonRpc("setDeviceWork", { objectId: body?.objectId, deviceId: (await params).id, work: body?.work });
}
