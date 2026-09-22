import { NextResponse } from "next/server";
import { openObjectGate } from "@/server/operations";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
  const result = await openObjectGate(body?.objectId);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}