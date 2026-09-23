"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";

export function AIBar({ prompt }: { prompt: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    setToken(null);
    const result = await runCommand(() =>
      fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      }),
    );
    setNotice(commandMessage(result.payload, unconfirmed));
    setToken(typeof result.payload?.confirmToken === "string" ? result.payload.confirmToken : null);
    if (result.ok && typeof result.payload?.confirmToken !== "string") router.refresh();
  }

  async function confirm() {
    if (!token) return;
    const result = await runCommand(() =>
      fetch("/api/ai/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    setNotice(commandMessage(result.payload, unconfirmed));
    setToken(null);
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel px-4 py-4">
      <p className="kicker text-muted">AI STAR HOME</p>
      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Запрос</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={prompt}
            className="control"
          />
        </label>
        <button type="submit" className="btn btn-primary shrink-0">
          Спросить
        </button>
      </div>
      {notice ? (
        <p role="status" className="fade-in mt-3 text-sm text-muted">
          {notice}
        </p>
      ) : null}
      {token ? (
        <button type="button" onClick={confirm} className="mt-3 btn btn-primary">
          Подтвердить
        </button>
      ) : null}
    </form>
  );
}
