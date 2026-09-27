import { DeviceDetail } from "@/components/admin/DeviceDetail";
import { requireDesk } from "@/server/access";
import { redirect } from "next/navigation";

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireDesk<{
    devices: { id: string; objectId: string; name: string; kind: string }[];
    rooms: { id: string; objectId: string; unitId: string; unitName: string; name: string }[];
    units: { id: string; objectId: string; name: string }[];
    gateways: { id: string; objectId: string; name: string; adapter: string; status: string }[];
    canCommand: boolean;
    canPair: boolean;
    canTechnical: boolean;
  }>("devices");
  const device = ops.devices.find((item) => item.id === id);
  if (!device) redirect("/admin/devices");
  return (
    <DeviceDetail
      device={device as Parameters<typeof DeviceDetail>[0]["device"]}
      rooms={ops.rooms ?? []}
      units={ops.units ?? []}
      gateways={ops.gateways ?? []}
      canCommand={ops.canCommand}
      canEdit={ops.canPair}
      canTechnical={ops.canTechnical}
    />
  );
}
