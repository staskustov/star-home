import { RequestDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext } from "@/server/access";
import { companyOps } from "@/server/ops-view";

export default async function RequestsPage() {
  const admin = await requireAdminContext();
  const ops = companyOps(admin.objects[0]?.companyId ?? "");
  return <RequestDesk requests={ops.requests} />;
}
