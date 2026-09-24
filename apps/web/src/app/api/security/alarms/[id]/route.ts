import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as { step?: unknown } | null;
  return jsonRpc("handleAlarm", { alarmId: (await params).id, step: body?.step });
}
