import { RequestDesk } from "@/components/admin/OpsDesk";
import { requireDesk } from "@/server/access";

export default async function RequestsPage() {
  const ops = await requireDesk<Parameters<typeof RequestDesk>[0]>("requests");
  return <RequestDesk requests={ops.requests} />;
}
