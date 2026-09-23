import { formatMoney } from "@/lib/format";

export function PaymentCard({ title, amount, currency }: { title: string; amount: number; currency: string }) {
  return (
    <article className="panel px-5 py-4">
      <h3 className="text-[17px] text-ink">{title}</h3>
      <p className="mt-2 text-[28px] leading-none font-medium tracking-[-0.04em] text-ink">{formatMoney(amount, currency)}</p>
    </article>
  );
}
