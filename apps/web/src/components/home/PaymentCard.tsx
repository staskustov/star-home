import { formatMoney } from "@/lib/format";

export function PaymentCard({ title, amount, currency }: { title: string; amount: number; currency: string }) {
  return (
    <article className="rounded-[20px] border border-line bg-surface px-5 py-4">
      <h3 className="text-[17px] text-ink">{title}</h3>
      <p className="mt-1 text-[22px] tracking-[-0.03em] text-ink">{formatMoney(amount, currency)}</p>
    </article>
  );
}
