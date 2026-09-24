import { NextResponse } from "next/server";
import { jsonRpc } from "@/server/rpc";

const methods: Record<string, string> = {
  add: "teamAdd",
  edit: "teamEdit",
  access: "teamAccess",
  block: "teamBlock",
  restore: "teamRestore",
  remove: "teamRemove",
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { op?: unknown } | null;
  const method = typeof body?.op === "string" && Object.hasOwn(methods, body.op) ? methods[body.op] : undefined;
  if (!method) return NextResponse.json({ message: "Неизвестное действие" }, { status: 400 });
  return jsonRpc(method, body);
}
