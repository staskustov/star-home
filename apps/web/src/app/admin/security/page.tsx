import { SecurityDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext } from "@/server/access";
import { companyOps } from "@/server/ops-view";

export default async function SecurityPage() {
  const admin = await requireAdminContext();
  const ops = companyOps(admin.objects[0]?.companyId ?? "");
  return <SecurityDesk alarms={ops.alarms} audit={ops.audit} />;
}
