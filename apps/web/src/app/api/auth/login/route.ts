import { NextResponse } from "next/server";
import { rpcWith } from "@/server/rpc-wire";
import { sessionCookie, sessionCookieOptions, signSession } from "@/server/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { login?: unknown; password?: unknown } | null;
  const result = await rpcWith<{ userId?: string; membershipId?: string | null; sessionVersion?: number; redirectTo?: string; message?: string }>(null, "login", body);
  if (result.status !== 200 || !result.body.userId || !result.body.redirectTo) {
    return NextResponse.json({ message: result.body.message ?? "Не удалось подтвердить выполнение." }, { status: result.status });
  }
  const response = NextResponse.json({ redirectTo: result.body.redirectTo });
  response.cookies.set(sessionCookie, signSession(result.body.userId, result.body.membershipId ?? null, result.body.sessionVersion ?? 1), sessionCookieOptions());
  return response;
}
