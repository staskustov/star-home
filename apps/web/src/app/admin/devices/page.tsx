import { DeviceDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function DevicesPage() {
  const ops = await requireDesk<Parameters<typeof DeviceDesk>[0]>("devices");
  return <DeviceDesk devices={ops.devices} meters={ops.meters} gateways={ops.gateways} events={ops.events} rooms={ops.rooms} canCommand={ops.canCommand} canPair={ops.canPair} />;
}
