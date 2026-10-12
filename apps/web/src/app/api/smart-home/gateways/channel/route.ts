import { NextResponse } from "next/server";
import { rpcWith } from "@/server/rpc-wire";

async function relay(token: string | null, body: Record<string, unknown> | null, pull: boolean): Promise<NextResponse> {
  const result = await rpcWith(null, "gatewayChannel", { token, body, pull });
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: Request) {
  return relay(request.headers.get("x-star-home-gateway"), null, true);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return relay(request.headers.get("x-star-home-gateway"), body, false);
}
