import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return jsonRpc("runHomeAction", body ?? {});
}
