import { SecurityDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function SecurityPage() {
  await requireAdminContext();
  const ops = await requireOps<Parameters<typeof SecurityDesk>[0]>();
  return <SecurityDesk alarms={ops.alarms} audit={ops.audit} />;
}
