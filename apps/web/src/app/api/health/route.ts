import { NextResponse } from "next/server";
import { embeddedRuntime } from "@/server/rpc-wire";

export async function GET() {
  return NextResponse.json(
    { ok: true, runtime: embeddedRuntime() ? "embedded" : "remote" },
    { headers: { "cache-control": "no-store" } },
  );
}
