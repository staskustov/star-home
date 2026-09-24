import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { SecurityPost } from "@/components/security/SecurityPost";
import { rpc } from "@/server/rpc";
import type { SecurityPostView } from "@/types/security";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { object } = await searchParams;
  const result = await rpc<SecurityPostView>("securityPost", { objectId: Array.isArray(object) ? object[0] : object });
  if (result.status === 401) redirect("/");
  if ((result.status === 403 || result.status === 404) && object) redirect("/security");
  if (result.status !== 200) redirect("/no-access");
  return (
    <>
      <LiveRefresh />
      <SecurityPost view={result.body} />
    </>
  );
}
