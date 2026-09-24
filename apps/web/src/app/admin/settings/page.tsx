import { LifeModeSettings } from "@/components/admin/LifeModeSettings";
import { requireSettings } from "@/server/access";

export default async function SettingsPage() {
  const board = await requireSettings<{ canEdit: boolean; objects: Parameters<typeof LifeModeSettings>[0]["objects"] }>();
  return <LifeModeSettings objects={board.objects} canEdit={board.canEdit} />;
}
