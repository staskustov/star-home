"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccessEvent } from "@/types/domain";

export function AccessPanel({
  place,
  passes,
  events,
}: {
  place: string;
  passes: { id: string; guestName: string; detail: string }[];
  events: AccessEvent[];
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [detail, setDetail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const response = await fetch("/api/access/passes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestName, detail }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setNotice(payload?.message ?? "Не удалось сохранить пропуск.");
      return;
    }
    setGuestName("");
    setDetail("");
    setNotice("Пропуск сохранён.");
    router.refresh();
  }

  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Доступ</h1>
      <p className="mt-2 text-[15px] text-muted">{place}</p>
      <form onSubmit={add} className="mt-8 space-y-3 rounded-[20px] border border-line bg-surface p-5">
        <Field label="Гость" value={guestName} onChange={setGuestName} />
        <Field label="Срок" value={detail} onChange={setDetail} />
        <button type="submit" className="h-12 rounded-[14px] bg-accent px-5 text-sm text-accent-contrast">
          Оформить пропуск
        </button>
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      </form>
      <ul className="mt-6 divide-y divide-line rounded-[20px] border border-line bg-surface">
        {passes.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">Гостей нет.</li>
        ) : (
          passes.map((pass) => (
            <li key={pass.id} className="px-5 py-4">
              <p className="text-[16px] text-ink">{pass.guestName}</p>
              <p className="text-sm text-muted">{pass.detail}</p>
            </li>
          ))
        )}
      </ul>
      <ul className="mt-6 divide-y divide-line rounded-[20px] border border-line bg-surface">
        {events.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">История пуста.</li>
        ) : (
          events.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[16px] text-ink">{item.title}</p>
                <p className="text-sm text-muted">{item.time}</p>
              </div>
              <StatusBadge tone={item.result === "SUCCESS" ? "success" : item.result === "UNCONFIRMED" ? "warning" : "danger"}>
                {item.result === "SUCCESS" ? "Разрешено" : item.result === "UNCONFIRMED" ? "Не подтверждено" : "Отказ"}
              </StatusBadge>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
