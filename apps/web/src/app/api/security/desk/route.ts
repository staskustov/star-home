import { jsonRpc } from "@/server/rpc";

export async function GET() {
  return jsonRpc("securityDesk");
}
