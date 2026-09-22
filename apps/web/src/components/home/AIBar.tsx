"use client";

import { useState } from "react";

export function AIBar({ prompt }: { prompt: string }) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    setNotice("Не удалось подтвердить выполнение.");
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[20px] border border-line bg-surface px-4 py-4">
      <p className="text-[12px] font-semibold tracking-[0.18em] text-muted">AI STAR HOME</p>
      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Запрос</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={prompt}
            className="h-12 w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
        <button type="submit" className="h-12 shrink-0 rounded-[14px] bg-accent px-4 text-sm text-accent-contrast">
          Спросить
        </button>
      </div>
      {notice ? (
        <p role="status" className="fade-in mt-3 text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
