import { jsonRpc } from "@/server/rpc";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRpc("smartHomeRoomDevices", { roomId: id });
}
