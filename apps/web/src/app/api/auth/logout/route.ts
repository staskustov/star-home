import { NextResponse } from "next/server";
import { publicUrl } from "@/server/same-origin";
import { clearSessionCookieOptions, sessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(publicUrl(request, "/"), 303);
  response.cookies.set(sessionCookie, "", clearSessionCookieOptions(request));
  return response;
}
