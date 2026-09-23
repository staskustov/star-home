"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import { Select } from "@/components/ui/Select";

const statusLabel: Record<string, string> = {
  CREATED: "Создана",
  ACCEPTED: "Принята",
  ASSIGNED: "Назначена",
  IN_PROGRESS: "В работе",
  WAITING: "Ожидает",
  DONE: "Выполнена",
  CLOSED: "Закрыта",
  NEW: "Создана",
};

export function RequestPanel({
  categories,
  requests,
}: {
  categories: string[];
  requests: { id: string; category: string; text: string; status: string }[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0] ?? "");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const selected = categories.includes(category) ? category : (categories[0] ?? "");

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: selected, text, fileName: fileName || undefined, fileBase64: fileBase64 || undefined }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload, unconfirmed));
      return;
    }
    setText("");
    setFileName("");
    setFileBase64("");
    setNotice("Заявка создана.");
    router.refresh();
  }

  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Сервис</h1>
      <p className="mt-2 text-[15px] text-muted">Заявки по дому</p>
      <form onSubmit={add} className="mt-8 space-y-3 panel p-5">
        <label className="block">
          <span className="text-sm text-muted">Тема</span>
          <Select wrapClassName="mt-2" value={selected} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="text-sm text-muted">Описание</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="control mt-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Файл</span>
          <input
            type="file"
            className="control mt-2"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setFileName("");
                setFileBase64("");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const encoded = String(reader.result ?? "");
                const comma = encoded.indexOf(",");
                setFileName(file.name);
                setFileBase64(comma >= 0 ? encoded.slice(comma + 1) : encoded);
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        <button type="submit" className="btn btn-primary w-full sm:w-auto">
          Создать заявку
        </button>
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      </form>
      <ul className="mt-6 divide-y divide-line panel">
        {requests.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">Заявок пока нет.</li>
        ) : (
          requests.map((request) => (
            <li key={request.id} className="px-5 py-4">
              <p className="text-[16px] text-ink">{request.category}</p>
              <p className="mt-1 text-sm text-muted">{request.text}</p>
              <p className="mt-2 text-sm text-graphite">{statusLabel[request.status] ?? request.status}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
