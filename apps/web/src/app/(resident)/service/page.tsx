import { RequestPanel } from "@/components/service/RequestPanel";
import { requireHome } from "@/server/access";
import { residentRequests } from "@/server/ops-view";

export default async function ServicePage() {
  const home = await requireHome();
  return <RequestPanel categories={home.serviceCategories} requests={residentRequests(home.unit.id)} />;
}
