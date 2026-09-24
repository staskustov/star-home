import { PaymentDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function PaymentsPage() {
  const ops = await requireDesk<Parameters<typeof PaymentDesk>[0]>("payments");
  return <PaymentDesk invoices={ops.invoices} />;
}
