import { AiDesk } from "@/components/admin/OpsDesk";
import { requireAdminContext, requireOps } from "@/server/access";

export default async function AdminAiPage() {
  await requireAdminContext();
  const ops = await requireOps<Parameters<typeof AiDesk>[0]>();
  return <AiDesk turns={ops.turns} />;
}