import { LifeModeSettings } from "@/components/admin/LifeModeSettings";
import { requireSettings } from "@/server/access";

export default async function SettingsPage() {
  const objects = await requireSettings<Parameters<typeof LifeModeSettings>[0]["objects"]>();
  return <LifeModeSettings objects={objects} />;
}
