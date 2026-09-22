import { AccessDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext } from "@/server/access";
import { companyOps } from "@/server/ops-view";

export default async function AdminAccessPage() {
  const admin = await requireAdminContext();
  const ops = companyOps(admin.objects[0]?.companyId ?? "");
  return <AccessDesk passes={ops.passes} events={ops.events} />;
}
