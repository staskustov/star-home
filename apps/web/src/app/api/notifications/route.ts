import { jsonRpc, rpc } from "@/server/rpc";

export async function GET() {
  const result = await rpc<{
    notices?: { id: string; title: string; body: string; at: string; severity?: string; readAt?: string | null }[];
    name?: string;
    photo?: string | null;
    message?: string;
  }>("profile");
  if (result.status !== 200) {
    return Response.json({ message: result.body.message ?? "Нужно войти" }, { status: result.status });
  }
  return Response.json({
    notices: result.body.notices ?? [],
    name: result.body.name ?? "",
    photo: result.body.photo ?? null,
  });
}

export async function POST() {
  return jsonRpc("readNotices");
}
