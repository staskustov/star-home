import { notFound } from "next/navigation";
import { LifeModeSettings } from "@/components/admin/LifeModeSettings";
import { settingsBoard } from "@/server/life-modes";

export default async function SettingsPage() {
  const objects = await settingsBoard();
  if (!objects) notFound();
  return <LifeModeSettings objects={objects} />;
}
