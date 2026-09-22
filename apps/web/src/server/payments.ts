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

export function paymentProvider(): PaymentProvider {
  return new LedgerProvider();
}
