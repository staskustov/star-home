import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { role?: unknown; permissions?: unknown } | null;
  return jsonRpc("rolesSave", { role: body?.role, permissions: body?.permissions });
}
