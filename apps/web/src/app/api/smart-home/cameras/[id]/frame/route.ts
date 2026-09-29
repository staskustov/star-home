import { NextResponse } from "next/server";
import { readSession } from "@/server/session";
import { readCameraJpeg, requestCameraFrame } from "@/server/camera-media";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = readCameraJpeg(await readSession(), id);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return new NextResponse(new Uint8Array(result.value.bytes), {
    status: 200,
    headers: {
      "content-type": result.value.mime,
      "cache-control": "private, no-store",
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
  const result = await requestCameraFrame(await readSession(), body?.objectId, id);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
