import { ResidentHomeScreen } from "@/components/home/ResidentHomeScreen";
import { requireHome } from "@/server/access";

export default async function ResidentHomePage() {
  const home = await requireHome();
  return <ResidentHomeScreen data={home} />;
}
