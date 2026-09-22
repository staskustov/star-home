import { AccessDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function AdminAccessPage() {
  await requireAdminContext();
  const ops = await requireOps<Parameters<typeof AccessDesk>[0]>();
  return <AccessDesk passes={ops.passes} events={ops.events} />;
}
