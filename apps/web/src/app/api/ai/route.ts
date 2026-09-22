import { NextResponse } from "next/server";
import { askOwnAssistant } from "@/server/ai";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { prompt?: unknown; objectId?: unknown } | null;
  const result = await askOwnAssistant(body?.prompt);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
