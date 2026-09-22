import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { destinationFor } from "@/server/routing";
import { adminMemberships, findMembership, homeMemberships } from "@/server/directory";
import { readSessionToken, sessionCookie } from "@/server/session";

const residentPaths = ["/home", "/access", "/ai", "/service", "/profile", "/my-objects"];

function isResidentPath(pathname: string): boolean {
  return residentPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = readSessionToken(request.cookies.get(sessionCookie)?.value);

  if (pathname === "/" && session) {
    return NextResponse.redirect(new URL(destinationFor(session.userId, session.membershipId), request.url));
  }

  const isPublic = pathname === "/" || pathname === "/forgot-password" || pathname === "/api/auth/login";
  if (!session) {
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Нужно войти" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/admin")) {
    if (adminMemberships(session.userId).length === 0) {
      return NextResponse.redirect(new URL(destinationFor(session.userId, session.membershipId), request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/my-objects") {
    if (homeMemberships(session.userId).length < 2) {
      return NextResponse.redirect(new URL(destinationFor(session.userId, session.membershipId), request.url));
    }
    return NextResponse.next();
  }

  if (isResidentPath(pathname)) {
    const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
    const hasHome = membership?.role === "RESIDENT" && Boolean(membership.unitId);
    if (!hasHome) {
      return NextResponse.redirect(new URL(destinationFor(session.userId, null), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|pwa-icon).*)"],
};
