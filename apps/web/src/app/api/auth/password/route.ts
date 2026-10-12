import { NextResponse } from "next/server";
import { clientFrom, rpcWith } from "@/server/rpc-wire";
import { clearSessionCookieOptions, sessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await rpcWith<{ changed?: boolean; message?: string }>(null, "changePassword", body, clientFrom(request.headers));
  if (result.status !== 200 || !result.body.changed) {
    return NextResponse.json({ message: result.body.message ?? "Не удалось сменить пароль" }, { status: result.status });
  }
  const response = NextResponse.json({ changed: true });
  response.cookies.set(sessionCookie, "", clearSessionCookieOptions(request));
  return response;
}
