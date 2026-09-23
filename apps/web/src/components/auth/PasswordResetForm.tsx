"use client";

import Link from "next/link";
import { useState } from "react";

export function PasswordResetForm() {
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setNotice("Введите почту");
      return;
    }
    setNotice("Если учётная запись есть, мы отправим письмо со ссылкой.");
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="text-center text-[15px] font-semibold tracking-[0.28em] text-ink">STAR HOME</p>
      <h1 className="mt-8 text-center text-[34px] leading-[1.12] tracking-[-0.04em] text-ink">Восстановление пароля</h1>
      <p className="mt-3 text-center text-[15px] text-muted">Укажите почту, которая привязана к входу.</p>

      <label className="mt-10 block">
        <span className="text-sm text-muted">Почта</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="control mt-2"
        />
      </label>

      {notice ? (
        <p role="status" className="mt-4 text-sm text-graphite">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-8 btn btn-primary btn-block"
      >
        Продолжить
      </button>

      <p className="mt-6 text-center">
        <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
          Вернуться ко входу
        </Link>
      </p>
    </form>
  );
}
