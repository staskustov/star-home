import { RequestDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function RequestsPage() {
  await requireAdminContext();
  const ops = await requireOps<{ requests: Parameters<typeof RequestDesk>[0]["requests"] }>();
  return <RequestDesk requests={ops.requests} />;
}
