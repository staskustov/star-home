import { PasswordChange } from "@/components/auth/PasswordChange";
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
        <section className="panel mt-6 p-5 sm:p-6">
          <h2 className="text-[19px] text-ink">Мой пароль</h2>
          <p className="mt-1 text-[14px] text-muted">После смены пароля все сеансы завершатся, войдите заново.</p>
          <PasswordChange className="mt-4 max-w-md" />
        </section>
      </div>
    </>
  );
}
