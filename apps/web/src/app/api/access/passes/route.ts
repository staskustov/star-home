import { NextResponse } from "next/server";
import { addOwnPass } from "@/server/operations";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { guestName?: unknown; detail?: unknown } | null;
  const result = await addOwnPass(body?.guestName, body?.detail);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
