import { NextResponse } from "next/server";
import { jsonRpc, rpc } from "@/server/rpc";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await rpc<{ mime?: string; base64?: string; message?: string }>("cameraJpeg", { deviceId: id });
  if (result.status !== 200 || !result.body.base64) {
    return NextResponse.json({ message: result.body.message ?? "Кадр ещё не получен." }, { status: result.status === 200 ? 409 : result.status });
  }
  return new NextResponse(new Uint8Array(Buffer.from(result.body.base64, "base64")), {
    status: 200,
    headers: {
      "content-type": result.body.mime ?? "image/jpeg",
      "cache-control": "private, no-store",
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
  return jsonRpc("cameraFrameRequest", { objectId: body?.objectId, deviceId: id });
}
