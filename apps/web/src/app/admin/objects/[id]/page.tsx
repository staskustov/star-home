import { ObjectBuilder } from "@/components/admin/ObjectBuilder";
import { requireTree } from "@/server/access";
import type { CatalogTree } from "@/types/catalog";

export default async function ObjectStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = await requireTree<CatalogTree>(id);
  return <ObjectBuilder key={tree.object.id} tree={tree} />;
}
