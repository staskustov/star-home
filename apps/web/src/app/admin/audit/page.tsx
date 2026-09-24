import { redirect } from "next/navigation";
import { AuditLog } from "@/components/admin/AuditLog";
import { rpc } from "@/server/rpc";
import type { AuditBoard } from "@/types/audit";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const result = await rpc<AuditBoard>("audit", {
    category: first(search.category),
    objectId: first(search.objectId),
    actorUserId: first(search.actorUserId),
    result: first(search.result),
    limit: first(search.limit),
  });
  if (result.status === 401) redirect("/");
  if (result.status !== 200) redirect("/admin");
  return <AuditLog board={result.body} />;
}
