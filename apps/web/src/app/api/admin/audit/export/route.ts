import { NextResponse } from "next/server";
import { rpc } from "@/server/rpc";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await rpc<{ fileName: string; csv: string } | { message: string }>("auditExport", {
    category: body?.category,
    objectId: body?.objectId,
    actorUserId: body?.actorUserId,
    result: body?.result,
  });
  if (result.status !== 200 || !("csv" in result.body)) return NextResponse.json(result.body, { status: result.status });
  return new NextResponse(result.body.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${result.body.fileName}"`,
      "cache-control": "no-store",
    },
  });
}
