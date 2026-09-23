import { SecurityDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function SecurityPage() {
  await requireAdminContext();
  const ops = await requireOps<{
    alarms: Parameters<typeof SecurityDesk>[0]["alarms"];
    audit: Parameters<typeof SecurityDesk>[0]["audit"];
    devices: { objectId: string; kind: string; name: string; state: string }[];
  }>();
  return (
    <SecurityDesk
      alarms={ops.alarms}
      audit={ops.audit}
      cameras={ops.devices.filter((device) => device.kind === "Камера").map((device) => ({ objectId: device.objectId, name: device.name, state: device.state }))}
    />
  );
}
