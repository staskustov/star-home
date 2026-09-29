import { NextResponse } from "next/server";
import { rpc } from "@/server/rpc";

export async function GET() {
  const result = await rpc<{ at: string } & Record<string, unknown>>("exportBackup", {});
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
  const at = typeof result.body.at === "string" ? result.body.at.slice(0, 19).replace(/[:T]/g, "-") : "now";
  return new NextResponse(JSON.stringify(result.body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="star-home-backup-${at}.json"`,
      "cache-control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirm?: unknown; backup?: unknown } | null;
  return rpc("restoreBackup", body ?? {});
}
