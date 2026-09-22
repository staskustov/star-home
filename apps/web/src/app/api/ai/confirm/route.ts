import { NextResponse } from "next/server";
import { confirmOwnAssistant } from "@/server/ai";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown; objectId?: unknown } | null;
  const result = await confirmOwnAssistant(body?.token);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}