import { AiDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function AdminAiPage() {
  const ops = await requireDesk<Parameters<typeof AiDesk>[0]>("ai");
  return <AiDesk turns={ops.turns} />;
}
