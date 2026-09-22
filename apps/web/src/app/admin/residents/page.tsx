import { ResidentsPanel } from "@/components/admin/ResidentsPanel";
import { requireResidents } from "@/server/access";

export default async function ResidentsPage() {
  const board = await requireResidents<Parameters<typeof ResidentsPanel>[0]>();
  return <ResidentsPanel people={board.people} objects={board.objects} />;
}
