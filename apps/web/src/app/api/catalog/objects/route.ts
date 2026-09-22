import { NextResponse } from "next/server";
import { catalogActor, createObject } from "@/server/catalog";

function fail(result: { status: number; message: string }) {
  return NextResponse.json({ message: result.message }, { status: result.status });
}

export async function POST(request: Request) {
  const actor = await catalogActor();
  if (!actor.ok) return fail(actor);
  const body = (await request.json().catch(() => null)) as { name?: unknown; type?: unknown; address?: unknown } | null;
  const result = createObject(actor.value, {
    name: body?.name,
    type: body?.type,
    address: body?.address,
  });
  if (!result.ok) return fail(result);
  return NextResponse.json(result.value, { status: 201 });
}
