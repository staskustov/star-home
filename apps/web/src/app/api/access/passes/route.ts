import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { guestName?: unknown; detail?: unknown } | null;
  return jsonRpc("addPass", body);
}
