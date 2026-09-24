import { redirect } from "next/navigation";
import { RolesMatrix } from "@/components/admin/RolesMatrix";
import { rpc } from "@/server/rpc";
import type { RolesBoard } from "@/types/roles";

export default async function RolesPage() {
  const result = await rpc<RolesBoard>("roles");
  if (result.status === 401) redirect("/");
  if (result.status !== 200) redirect("/admin");
  return <RolesMatrix board={result.body} />;
}
