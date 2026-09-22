import { NextResponse } from "next/server";
import { catalogActor, removeObject, treeFor, updateObject } from "@/server/catalog";

function fail(result: { status: number; message: string }) {
  return NextResponse.json({ message: result.message }, { status: result.status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await catalogActor();
  if (!actor.ok) return fail(actor);
  const { id } = await params;
  const tree = treeFor(actor.value, id);
  if (!tree) return NextResponse.json({ message: "Объект не найден" }, { status: 404 });
  return NextResponse.json(tree);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await catalogActor();
  if (!actor.ok) return fail(actor);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; address?: unknown } | null;
  const result = updateObject(actor.value, id, { name: body?.name, address: body?.address });
  if (!result.ok) return fail(result);
  return NextResponse.json(result.value);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await catalogActor();
  if (!actor.ok) return fail(actor);
  const { id } = await params;
  const result = removeObject(actor.value, id);
  if (!result.ok) return fail(result);
  return NextResponse.json(result.value);
}
