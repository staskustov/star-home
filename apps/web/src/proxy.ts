import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rpcWith } from "@/server/rpc-wire";
import { crossSiteWrite } from "@/server/same-origin";
import { readSessionToken, sessionCookie } from "@/server/session";

function signedOut(response: NextResponse): NextResponse {
  response.cookies.set(sessionCookie, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && crossSiteWrite(request.method, request.headers)) {
    return NextResponse.json({ message: "Запрос отклонён" }, { status: 403 });
  }
  const session = readSessionToken(request.cookies.get(sessionCookie)?.value);
  const isPublic = pathname === "/" || pathname === "/forgot-password" || pathname === "/api/auth/login" || pathname === "/offline.html";

  if (!session) {
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ message: "Нужно войти" }, { status: 401 });
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/" || pathname === "/forgot-password") {
    const destination = await rpcWith<{ redirectTo?: string }>(session, "destination");
    if (destination.status === 401) return signedOut(NextResponse.next());
    return NextResponse.redirect(new URL(destination.body.redirectTo ?? "/home", request.url));
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  const guard = await rpcWith<{ redirect?: string }>(session, "guard", { pathname });
  if (guard.status === 401) return signedOut(NextResponse.redirect(new URL("/", request.url)));
  if (guard.body.redirect) return NextResponse.redirect(new URL(guard.body.redirect, request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|pwa-icon|images/).*)"],
};
