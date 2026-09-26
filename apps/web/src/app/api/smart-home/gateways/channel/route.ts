import { NextResponse } from "next/server";
import { ackGateway, heartbeatGateway, ingestGatewayState, pullGateway } from "@/server/gateway-channel";

export async function GET(request: Request) {
  const token = request.headers.get("x-star-home-gateway");
  const result = pullGateway(token);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}

export async function POST(request: Request) {
  const token = request.headers.get("x-star-home-gateway");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  const result =
    kind === "state"
      ? ingestGatewayState(token, body ?? {})
      : kind === "pull"
        ? pullGateway(token)
        : kind === "ack"
          ? ackGateway(token, body ?? {})
          : heartbeatGateway(token, body ?? {});
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
