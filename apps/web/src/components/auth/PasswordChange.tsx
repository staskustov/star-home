"use client";

import { useState } from "react";

export function PasswordChange({ login: knownLogin, className = "" }: { login?: string; className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = knownLogin ?? String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const repeat = String(form.get("repeat") ?? "");
    if (!login || !password || !newPassword) {
      setError("Заполните все поля");
      return;
    }
    if (newPassword !== repeat) {
      setError("Новые пароли не совпадают");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login, password, newPassword }),
    }).catch(() => null);
    setBusy(false);
    const body = (await response?.json().catch(() => null)) as { message?: string } | null;
    if (!response?.ok) {
      setError(body?.message ?? "Не удалось сменить пароль");
      return;
    }
    setDone(true);
    window.setTimeout(() => window.location.assign("/"), 1200);
  }

  if (done) {
    return (
      <p role="status" className={`text-[15px] text-graphite ${className}`}>
        Пароль изменён. Войдите с новым паролем.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`space-y-3 ${className}`}>
      {knownLogin ? null : (
        <label className="field">
          <span className="sr-only">Логин</span>
          <input name="login" autoComplete="username" placeholder="Логин" className="control" />
        </label>
      )}
      <label className="field">
        <span className="sr-only">Текущий пароль</span>
        <input name="password" type="password" autoComplete="current-password" placeholder="Текущий пароль" className="control" />
      </label>
      <label className="field">
        <span className="sr-only">Новый пароль</span>
        <input name="newPassword" type="password" autoComplete="new-password" placeholder="Новый пароль, от 10 символов" className="control" />
      </label>
      <label className="field">
        <span className="sr-only">Повторите новый пароль</span>
        <input name="repeat" type="password" autoComplete="new-password" placeholder="Повторите новый пароль" className="control" />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
        {busy ? "Сохраняю…" : "Сменить пароль"}
      </button>
    </form>
  );
}
