import { NextResponse } from "next/server";
import { addOwnRequest } from "@/server/operations";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { category?: unknown; text?: unknown; objectId?: unknown } | null;
  const result = await addOwnRequest(body?.category, body?.text);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ id: result.value.id, status: result.value.status });
}
