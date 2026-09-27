import { PaymentsPanel } from "@/components/home/PaymentsPanel";
import { requireHome } from "@/server/access";

export default async function PaymentsPage() {
  const home = await requireHome();
  return <PaymentsPanel balance={home.balance} history={home.paymentHistory} canPay={home.canPay} />;
}
