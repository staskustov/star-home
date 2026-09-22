import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  return jsonRpc("switchMode", { mode: body?.mode });
}
