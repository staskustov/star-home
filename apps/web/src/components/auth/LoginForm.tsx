"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!login || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string; redirectTo?: string } | null;
    const redirectTo = body?.redirectTo;
    if (!response.ok || !redirectTo?.startsWith("/") || redirectTo.startsWith("//")) {
      setError(body?.message ?? "Неверный логин или пароль");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-center text-[28px] font-semibold tracking-[0.28em] text-ink sm:text-[32px]">STAR HOME</h1>

      <label className="mt-12 block">
        <span className="text-sm text-muted">Логин</span>
        <input
          name="login"
          autoComplete="username"
          className="control mt-2"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm text-muted">Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="control mt-2"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-8 btn btn-primary btn-block"
      >
        Войти
      </button>

      <p className="mt-5 text-center">
        <Link href="/forgot-password" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Забыли пароль?
        </Link>
      </p>
      <div className="mt-8 flex justify-center">
        <ThemeToggle />
      </div>
    </form>
  );
}
