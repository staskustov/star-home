import { NextResponse } from "next/server";
import { findUserByLogin } from "@/server/directory";
import { clearLoginFailures, isLoginLimited, recordLoginFailure } from "@/server/login-limit";
import { verifyPassword } from "@/server/password";
import { destinationFor, initialMembershipId } from "@/server/access";
import { sessionCookie, sessionCookieOptions, signSession } from "@/server/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { login?: unknown; password?: unknown } | null;
  const login = typeof body?.login === "string" ? body.login.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!login || !password) {
    return NextResponse.json({ message: "Введите логин и пароль" }, { status: 400 });
  }
  if (isLoginLimited(login)) {
    return NextResponse.json({ message: "Слишком много попыток. Подождите немного." }, { status: 429 });
  }

  const user = findUserByLogin(login);
  const passwordMatches = user ? verifyPassword(password, user.passwordHash) : verifyPassword(password, "missing.missing");
  if (!user || !passwordMatches) {
    recordLoginFailure(login);
    return NextResponse.json({ message: "Неверный логин или пароль" }, { status: 401 });
  }

  clearLoginFailures(login);
  const membershipId = initialMembershipId(user.id);
  const redirectTo = destinationFor(user.id, membershipId);
  const response = NextResponse.json({ redirectTo });
  response.cookies.set(sessionCookie, signSession(user.id, membershipId), sessionCookieOptions());
  return response;
}
