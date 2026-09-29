import { DeviceDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function DevicesPage() {
  const ops = await requireDesk<Parameters<typeof DeviceDesk>[0]>("devices");
  return (
    <DeviceDesk
      devices={ops.devices}
      meters={ops.meters}
      gateways={ops.gateways}
      events={ops.events}
      rooms={ops.rooms ?? []}
      units={ops.units ?? []}
      commandLogs={ops.commandLogs}
      exchanges={ops.exchanges ?? []}
      plans={ops.plans}
      canCommand={ops.canCommand}
      canPair={ops.canPair}
      canCreate={ops.canCreate}
    />
  );
}
