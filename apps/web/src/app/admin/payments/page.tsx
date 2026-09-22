import { PaymentDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function PaymentsPage() {
  await requireAdminContext();
  const ops = await requireOps<Parameters<typeof PaymentDesk>[0]>();
  return <PaymentDesk invoices={ops.invoices} />;
}
