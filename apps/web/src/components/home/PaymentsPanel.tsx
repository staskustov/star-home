"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { commandMessage, runCommand } from "@/lib/command";
import type { Money } from "@/types/domain";

export function PaymentsPanel({
  balance,
  history,
  canPay,
}: {
  balance: Money | null;
  history: { title: string; amount: number; currency: string }[];
  canPay?: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() => fetch("/api/payments/pay", { method: "POST" }));
    setBusy(false);
    setNotice(commandMessage(result.payload));
    if (result.ok && result.payload?.confirmed) router.refresh();
  }

  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Платежи</h1>
      <div className="panel mt-6 px-5 py-5">
        {balance ? (
          <>
            <p className="text-[15px] text-muted">Открытый счёт</p>
            <p className="mt-2 text-[28px] tracking-[-0.03em] text-ink">{formatMoney(balance.amount, balance.currency)}</p>
            {canPay ? (
              <button type="button" className="btn btn-primary mt-5" disabled={busy} onClick={() => void pay()}>
                Оплатить
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-[15px] text-muted">Открытых счетов нет.</p>
        )}
      </div>
      {history.length ? (
        <ul className="panel mt-4 overflow-hidden">
          {history.map((payment) => (
            <li key={`${payment.title}-${payment.amount}`} className="list-row">
              <span className="flex-1 text-[15px] text-ink">{payment.title}</span>
              <span className="text-[13px] text-muted">{formatMoney(payment.amount, payment.currency)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
