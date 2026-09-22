"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!login || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setError(null);
    router.push("/home");
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-center text-[28px] font-semibold tracking-[0.22em] text-ink sm:text-[32px]">STAR HOME</h1>

      <label className="mt-12 block">
        <span className="text-sm text-muted">Логин</span>
        <input
          name="login"
          autoComplete="username"
          className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-surface px-4 text-base text-ink outline-none transition-colors duration-200 focus:border-accent"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm text-muted">Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-surface px-4 text-base text-ink outline-none transition-colors duration-200 focus:border-accent"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-8 h-[52px] w-full rounded-[14px] bg-accent text-[15px] font-medium text-accent-contrast transition-opacity duration-200 hover:opacity-90"
      >
        Войти
      </button>

      <p className="mt-6 text-center">
        <Link href="/forgot-password" className="text-sm text-muted underline-offset-4 hover:underline">
          Забыли пароль?
        </Link>
      </p>
    </form>
  );
}
