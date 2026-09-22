const windowMs = 10 * 60 * 1000;
const maxFailures = 8;
const failures = new Map<string, { count: number; resetAt: number }>();

type LimitAction = "check" | "fail" | "clear";
const runtime = globalThis as typeof globalThis & {
  __starLoginLimit?: (action: LimitAction, login: string) => Promise<boolean>;
};

export function bindLoginLimit(limit: (action: LimitAction, login: string) => Promise<boolean>): void {
  runtime.__starLoginLimit = limit;
}

export async function loginLimited(login: string): Promise<boolean> {
  if (runtime.__starLoginLimit) return runtime.__starLoginLimit("check", login);
  return isLoginLimited(login);
}

export async function noteLoginFailure(login: string): Promise<void> {
  if (runtime.__starLoginLimit) {
    await runtime.__starLoginLimit("fail", login);
    return;
  }
  recordLoginFailure(login);
}

export async function noteLoginSuccess(login: string): Promise<void> {
  if (runtime.__starLoginLimit) {
    await runtime.__starLoginLimit("clear", login);
    return;
  }
  clearLoginFailures(login);
}

export function isLoginLimited(login: string): boolean {
  const entry = failures.get(login.trim().toLowerCase());
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    failures.delete(login.trim().toLowerCase());
    return false;
  }
  return entry.count >= maxFailures;
}

export function recordLoginFailure(login: string) {
  const key = login.trim().toLowerCase();
  const current = failures.get(key);
  const now = Date.now();
  if (!current || current.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
}

export function clearLoginFailures(login: string) {
  failures.delete(login.trim().toLowerCase());
}
