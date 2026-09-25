import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rpcWith } from "@/server/rpc-wire";
import { crossSiteWrite, publicUrl } from "@/server/same-origin";
import { clearSessionCookieOptions, readSessionToken, sessionCookie } from "@/server/session";

function signedOut(response: NextResponse, request: NextRequest): NextResponse {
  response.cookies.set(sessionCookie, "", clearSessionCookieOptions(request));
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && crossSiteWrite(request.method, request.headers)) {
    return NextResponse.json({ message: "Запрос отклонён" }, { status: 403 });
  }
  const session = readSessionToken(request.cookies.get(sessionCookie)?.value);
  const isPublic = pathname === "/" || pathname === "/forgot-password" || pathname === "/api/auth/login" || pathname === "/api/auth/logout" || pathname === "/offline.html" || pathname === "/favicon.svg" || pathname === "/app-icon.svg";

  if (!session) {
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ message: "Нужно войти" }, { status: 401 });
    return NextResponse.redirect(publicUrl(request, "/"));
  }

  if (pathname === "/" || pathname === "/forgot-password") {
    const destination = await rpcWith<{ redirectTo?: string }>(session, "destination");
    if (destination.status === 401) return signedOut(NextResponse.next(), request);
    return NextResponse.redirect(publicUrl(request, destination.body.redirectTo ?? "/home"));
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  const guard = await rpcWith<{ redirect?: string }>(session, "guard", { pathname });
  if (guard.status === 401) return signedOut(NextResponse.redirect(publicUrl(request, "/")), request);
  if (guard.body.redirect) return NextResponse.redirect(publicUrl(request, guard.body.redirect));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|app-icon.svg|manifest.webmanifest|sw.js|offline.html|pwa-icon|images/).*)"],
};
