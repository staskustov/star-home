import { NextResponse } from "next/server";
import { addResident, residentsActor } from "@/server/residents";

export async function POST(request: Request) {
  const actor = await residentsActor();
  if (!actor.ok) return NextResponse.json({ message: actor.message }, { status: actor.status });
  const body = (await request.json().catch(() => null)) as {
    objectId?: unknown;
    unitId?: unknown;
    name?: unknown;
    login?: unknown;
    password?: unknown;
  } | null;
  const result = addResident(actor.value, {
    objectId: body?.objectId,
    unitId: body?.unitId,
    name: body?.name,
    login: body?.login,
    password: body?.password,
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value, { status: 201 });
}
