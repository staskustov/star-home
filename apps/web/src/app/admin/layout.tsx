import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPreviewProvider } from "@/components/admin/AdminPreview";
import { requireAdminContext } from "@/server/access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminContext();
  return (
    <AdminPreviewProvider companyName={admin.companyName} actorLabel={admin.actorLabel} initialObjects={admin.objects} sections={admin.sections} permissions={admin.permissions}>
      <AdminFrame>{children}</AdminFrame>
    </AdminPreviewProvider>
  );
}
