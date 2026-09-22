import { jsonRpc } from "@/server/rpc";

export async function POST() {
  return jsonRpc("openGate");
}
