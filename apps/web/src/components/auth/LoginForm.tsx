"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StarMark } from "@/components/brand/StarMark";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

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
      <div className="flex flex-col items-center">
        <StarMark className="h-9 w-9 text-accent" />
        <h1 className="mt-5 text-center text-[28px] font-light tracking-[0.3em] text-ink sm:text-[32px]">STAR HOME</h1>
      </div>

      <div className="mt-14 space-y-3">
        <label className="field">
          <span className="sr-only">Логин</span>
          <FieldIcon d="M12 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2ZM5 19.5c1.3-3 3.8-4.4 7-4.4s5.7 1.4 7 4.4" />
          <input name="login" autoComplete="username" placeholder="Логин" className="control field-input" />
        </label>
        <label className="field">
          <span className="sr-only">Пароль</span>
          <FieldIcon d="M6.5 11h11v8.5h-11zM8.8 11V8.2a3.2 3.2 0 0 1 6.4 0V11" />
          <input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Пароль"
            className="control field-input pr-12"
          />
          <button
            type="button"
            className="field-action"
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
          >
            <FieldIcon d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6ZM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z" inline />
          </button>
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button type="submit" className="mt-6 btn btn-primary btn-block">
        Войти
      </button>

      <p className="mt-6 text-center">
        <Link href="/forgot-password" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Забыли пароль?
        </Link>
      </p>
    </form>
  );
}

function FieldIcon({ d, inline = false }: { d: string; inline?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={inline ? "h-5 w-5" : "field-icon h-5 w-5"}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
