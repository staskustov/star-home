import { NextResponse } from "next/server";
import { setRequestStatus } from "@/server/operations";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown; objectId?: unknown } | null;
  const result = await setRequestStatus(id, body?.status, body?.objectId);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ id: result.value.id, status: result.value.status });
}
