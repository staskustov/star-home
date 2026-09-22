import { RequestPanel } from "@/components/service/RequestPanel";
import { requireRequests } from "@/server/access";

export default async function ServicePage() {
  const board = await requireRequests();
  return <RequestPanel categories={board.categories} requests={board.requests} />;
}
