import { BackupPanel } from "@/components/admin/BackupPanel";
import { LifeModeSettings } from "@/components/admin/LifeModeSettings";
import { requireSettings } from "@/server/access";

export default async function SettingsPage() {
  const board = await requireSettings<{
    canEdit: boolean;
    canBackup?: boolean;
    canRestore?: boolean;
    objects: Parameters<typeof LifeModeSettings>[0]["objects"];
  }>();
  return (
    <>
      <LifeModeSettings objects={board.objects} canEdit={board.canEdit} />
      <div className="mx-auto max-w-3xl">
        <BackupPanel canBackup={Boolean(board.canBackup)} canRestore={Boolean(board.canRestore)} />
      </div>
    </>
  );
}
