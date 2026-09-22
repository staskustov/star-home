import { NextResponse } from "next/server";
import { catalogActor, createBuilding } from "@/server/catalog";

function fail(result: { status: number; message: string }) {
  return NextResponse.json({ message: result.message }, { status: result.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await catalogActor();
  if (!actor.ok) return fail(actor);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const result = createBuilding(actor.value, id, body?.name);
  if (!result.ok) return fail(result);
  return NextResponse.json(result.value, { status: 201 });
}
