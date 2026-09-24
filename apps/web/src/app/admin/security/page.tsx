import { SecurityDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function SecurityPage() {
  const ops = await requireDesk<Parameters<typeof SecurityDesk>[0]>("security");
  return <SecurityDesk alarms={ops.alarms} audit={ops.audit} cameras={ops.cameras} />;
}
