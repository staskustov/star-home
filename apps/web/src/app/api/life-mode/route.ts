import { NextResponse } from "next/server";
import { switchOwnMode } from "@/server/life-modes";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const result = await switchOwnMode(body?.mode);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
