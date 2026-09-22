import { AccessPanel } from "@/components/access/AccessPanel";
import { requireAccess } from "@/server/access";

export default async function AccessPage() {
  const access = await requireAccess();
  return <AccessPanel place={access.place} canCreate={access.canCreate} passes={access.passes} events={access.events} />;
}
