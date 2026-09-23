import { rpc } from "@/server/rpc";

export async function GET() {
  const result = await rpc<{ notices?: { id: string; title: string; body: string; at: string }[]; message?: string }>("profile");
  if (result.status !== 200) {
    return Response.json({ message: result.body.message ?? "Нужно войти" }, { status: result.status });
  }
  return Response.json({ notices: result.body.notices ?? [] });
}
