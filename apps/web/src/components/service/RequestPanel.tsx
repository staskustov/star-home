"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const statusLabel = { NEW: "Новая", IN_PROGRESS: "В работе", DONE: "Готово" };

export function RequestPanel({
  categories,
  requests,
}: {
  categories: string[];
  requests: { id: string; category: string; text: string; status: "NEW" | "IN_PROGRESS" | "DONE" }[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0] ?? "");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const selected = categories.includes(category) ? category : (categories[0] ?? "");

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: selected, text }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setNotice(payload?.message ?? "Не удалось создать заявку.");
      return;
    }
    setText("");
    setNotice("Заявка создана.");
    router.refresh();
  }

  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Сервис</h1>
      <p className="mt-2 text-[15px] text-muted">Заявки по дому</p>
      <form onSubmit={add} className="mt-8 space-y-3 rounded-[20px] border border-line bg-surface p-5">
        <label className="block">
          <span className="text-sm text-muted">Тема</span>
          <select
            value={selected}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-2 h-12 w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-muted">Описание</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-2 min-h-24 w-full rounded-[14px] border border-line bg-bg px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
        </label>
        <button type="submit" className="h-12 rounded-[14px] bg-accent px-5 text-sm text-accent-contrast">
          Создать заявку
        </button>
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      </form>
      <ul className="mt-6 divide-y divide-line rounded-[20px] border border-line bg-surface">
        {requests.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">Заявок пока нет.</li>
        ) : (
          requests.map((request) => (
            <li key={request.id} className="px-5 py-4">
              <p className="text-[16px] text-ink">{request.category}</p>
              <p className="mt-1 text-sm text-muted">{request.text}</p>
              <p className="mt-2 text-sm text-graphite">{statusLabel[request.status]}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
