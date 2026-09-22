import { notFound } from "next/navigation";
import { ObjectBuilder } from "@/components/admin/ObjectBuilder";
import { catalogActor, treeFor } from "@/server/catalog";

export default async function ObjectStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await catalogActor();
  if (!actor.ok) notFound();
  const tree = treeFor(actor.value, id);
  if (!tree) notFound();
  return <ObjectBuilder key={tree.object.id} tree={tree} />;
}
