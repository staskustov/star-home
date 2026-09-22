import { DeviceDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function DevicesPage() {
  await requireAdminContext();
  const ops = await requireOps<Parameters<typeof DeviceDesk>[0]>();
  return <DeviceDesk devices={ops.devices} meters={ops.meters} />;
}
