import { AccessPanel } from "@/components/access/AccessPanel";
import { requireHome } from "@/server/access";
import { residentAccess } from "@/server/ops-view";

export default async function AccessPage() {
  const home = await requireHome();
  const access = residentAccess(home.unit.id, home.object.id);
  return <AccessPanel place={`${home.object.name} · ${home.unit.name}`} passes={access.passes} events={access.events} />;
}
