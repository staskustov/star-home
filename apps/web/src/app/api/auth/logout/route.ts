import { NextResponse } from "next/server";
import { handleRpc } from "@/server/rpc-handlers";
import { publicUrl } from "@/server/same-origin";
import { clearSessionCookieOptions, readSession, sessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (session) await handleRpc("logout", {}, session);
  const response = NextResponse.redirect(publicUrl(request, "/"), 303);
  response.cookies.set(sessionCookie, "", clearSessionCookieOptions(request));
  return response;
}
