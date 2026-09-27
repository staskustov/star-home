import { jsonRpc } from "@/server/rpc";

export async function GET(_request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  return jsonRpc("discoveryScan", { scanId });
}
