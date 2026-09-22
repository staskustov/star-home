import { NextResponse } from "next/server";
import { openOwnGate } from "@/server/operations";

export async function POST() {
  const result = await openOwnGate();
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json(result.value);
}
