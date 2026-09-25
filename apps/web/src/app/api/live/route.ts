import { NextResponse } from "next/server";
import { rpc } from "@/server/rpc";
import { embeddedRuntime } from "@/server/rpc-wire";

function socketUrl(): string | null {
  if (process.env.STAR_HOME_LIVE_URL) return process.env.STAR_HOME_LIVE_URL;
  return embeddedRuntime() ? null : "ws://127.0.0.1:3457/live";
}

export async function GET() {
  const socket = socketUrl();
  const result = await rpc<{ token?: string }>("liveToken", { poll: !socket });
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ ...result.body, socket });
}
