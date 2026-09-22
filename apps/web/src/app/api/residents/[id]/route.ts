import { NextResponse } from "next/server";
import { removeResident, residentsActor } from "@/server/residents";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await residentsActor();
  if (!actor.ok) return NextResponse.json({ message: actor.message }, { status: actor.status });
  const { id } = await params;
  const result = removeResident(actor.value, id);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
