import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPreviewProvider } from "@/components/admin/AdminPreview";
import { adminDashboard } from "@/mocks/admin-dashboard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminPreviewProvider
      companyName={adminDashboard.company.name}
      actorLabel={adminDashboard.actorLabel}
      initialObjects={adminDashboard.objects}
    >
      <AdminFrame>{children}</AdminFrame>
    </AdminPreviewProvider>
  );
}
