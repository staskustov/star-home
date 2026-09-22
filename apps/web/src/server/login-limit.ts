const windowMs = 10 * 60 * 1000;
const maxFailures = 8;
const failures = new Map<string, { count: number; resetAt: number }>();

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
