import { NextResponse } from "next/server";
import { destinationFor } from "@/server/access";
import { findMembership } from "@/server/directory";
import { readSession, sessionCookie, sessionCookieOptions, signSession } from "@/server/session";

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
  if (!session) {
    return NextResponse.json({ message: "Нужно войти" }, { status: 401 });
  }
  const membershipId = await membershipIdFrom(request);
  const membership = findMembership(session.userId, membershipId);
  if (!membership) {
    return NextResponse.json({ message: "Нет доступа" }, { status: 403 });
  }
  const redirectTo = destinationFor(session.userId, membership.id);
  const acceptsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const response = acceptsJson
    ? NextResponse.json({ redirectTo })
    : NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(sessionCookie, signSession(session.userId, membership.id), sessionCookieOptions());
  return response;
}
