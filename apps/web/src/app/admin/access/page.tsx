import { AccessDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function AdminAccessPage() {
  const ops = await requireDesk<Parameters<typeof AccessDesk>[0]>("access");
  return <AccessDesk passes={ops.passes} events={ops.events} />;
}
