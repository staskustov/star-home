import { NextResponse } from "next/server";
import { saveModeSetting } from "@/server/life-modes";
import type { LifeModeSetting } from "@/types/domain";

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as { objectId?: unknown; setting?: Partial<LifeModeSetting> } | null;
  const result = await saveModeSetting({ objectId: body?.objectId, setting: body?.setting ?? null });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
