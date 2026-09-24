import { redirect } from "next/navigation";
import { EngineeringBoard } from "@/components/admin/EngineeringBoard";
import { rpc } from "@/server/rpc";
import type { EngineeringBoard as Board } from "@/types/engineering";

export default async function EngineeringPage() {
  const result = await rpc<Board>("engineering", {});
  if (result.status === 401) redirect("/");
  if (result.status !== 200) redirect("/admin");
  return <EngineeringBoard board={result.body} />;
}
