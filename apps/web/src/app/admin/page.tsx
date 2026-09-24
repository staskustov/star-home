import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { requireDashboard } from "@/server/access";

export default async function AdminPage() {
  return <AdminDashboard view={await requireDashboard()} />;
}
