import { NextResponse } from "next/server";
import { sessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(sessionCookie, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
