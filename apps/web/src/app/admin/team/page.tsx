import { redirect } from "next/navigation";
import { TeamPanel } from "@/components/admin/TeamPanel";
import { rpc } from "@/server/rpc";
import type { TeamBoard } from "@/types/team";

export default async function TeamPage() {
  const result = await rpc<TeamBoard>("team");
  if (result.status === 401) redirect("/");
  if (result.status !== 200) redirect("/admin");
  return <TeamPanel board={result.body} />;
}
