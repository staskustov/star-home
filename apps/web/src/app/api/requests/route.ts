import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { category?: unknown; text?: unknown; fileName?: unknown; fileBase64?: unknown } | null;
  return jsonRpc("addRequest", body);
}
