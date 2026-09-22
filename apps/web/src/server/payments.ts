import type { Invoice } from "@/server/ops-store";

export interface PaymentProvider {
  pay(invoice: Pick<Invoice, "id" | "amount" | "currency">): Promise<{ confirmed: boolean; reference: string }>;
}

class LedgerProvider implements PaymentProvider {
  async pay(invoice: Pick<Invoice, "id" | "amount" | "currency">): Promise<{ confirmed: boolean; reference: string }> {
    if (invoice.amount <= 0) return { confirmed: false, reference: "" };
    return { confirmed: true, reference: `ledger_${invoice.id}` };
  }
}

class BankPaymentProvider implements PaymentProvider {
  async pay(invoice: Pick<Invoice, "id" | "amount" | "currency">): Promise<{ confirmed: boolean; reference: string }> {
    const endpoint = process.env.STAR_HOME_BANK_URL;
    if (!endpoint) return { confirmed: false, reference: "" };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: invoice.amount, currency: invoice.currency, reference: invoice.id }),
    }).catch(() => null);
    if (!response?.ok) return { confirmed: false, reference: "" };
    const payload = (await response.json().catch(() => null)) as { confirmed?: boolean; reference?: string } | null;
    return { confirmed: Boolean(payload?.confirmed), reference: payload?.reference ?? "" };
  }
}

export function paymentProvider(): PaymentProvider {
  if (process.env.STAR_HOME_BANK_URL) return new BankPaymentProvider();
  return new LedgerProvider();
}
