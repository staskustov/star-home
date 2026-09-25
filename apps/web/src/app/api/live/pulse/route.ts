import { NextResponse, type NextRequest } from "next/server";
import { readLiveToken } from "@/server/live-token";
import { readPulse } from "@/server/persistence/pulse";

export async function GET(request: NextRequest) {
  const live = readLiveToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!live) return NextResponse.json({ message: "Нужно войти" }, { status: 401 });
  return NextResponse.json({ pulse: await readPulse(live.objectId) });
}
