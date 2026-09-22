import { notFound } from "next/navigation";
import { ResidentsPanel } from "@/components/admin/ResidentsPanel";
import { residentBoard, residentsActor } from "@/server/residents";

export default async function ResidentsPage() {
  const actor = await residentsActor();
  if (!actor.ok) notFound();
  const board = residentBoard(actor.value);
  return <ResidentsPanel people={board.people} objects={board.objects} />;
}
