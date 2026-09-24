import { NextResponse } from "next/server";
import { rpc } from "@/server/rpc";
import { sessionCookie, sessionCookieOptions, signSession } from "@/server/session";
import { readSession } from "@/server/session";

async function membershipIdFrom(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { membershipId?: unknown } | null;
    return typeof body?.membershipId === "string" ? body.membershipId : "";
  }
  const form = await request.formData();
  return String(form.get("membershipId") ?? "");
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ message: "Нужно войти" }, { status: 401 });
  const membershipId = await membershipIdFrom(request);
  const result = await rpc<{ membershipId?: string; redirectTo?: string; message?: string }>("switch", { membershipId });
  if (result.status !== 200 || !result.body.redirectTo || !result.body.membershipId) {
    return NextResponse.json({ message: result.body.message ?? "Нет доступа" }, { status: result.status });
  }
  const acceptsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const response = acceptsJson
    ? NextResponse.json({ redirectTo: result.body.redirectTo })
    : NextResponse.redirect(new URL(result.body.redirectTo, request.url), 303);
  response.cookies.set(sessionCookie, signSession(session.userId, result.body.membershipId, session.sv), sessionCookieOptions());
  return response;
}
