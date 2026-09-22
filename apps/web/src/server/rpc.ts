import { NextResponse } from "next/server";
import { readSession } from "@/server/session";
import { rpcWith } from "@/server/rpc-wire";

export { rpcWith } from "@/server/rpc-wire";

export async function rpc<T = unknown>(method: string, input?: unknown): Promise<{ status: number; body: T }> {
  return rpcWith<T>(await readSession(), method, input);
}

export async function jsonRpc(method: string, input?: unknown): Promise<NextResponse> {
  const result = await rpc(method, input);
  return NextResponse.json(result.body, { status: result.status });
}
