import { jsonRpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { photo?: unknown } | null;
  return jsonRpc("saveProfilePhoto", { photo: body?.photo ?? null });
}
