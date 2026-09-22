import { ResidentHomeScreen } from "@/components/home/ResidentHomeScreen";
import { residentHome } from "@/mocks/resident-home";

export default function ResidentHomePage() {
  return <ResidentHomeScreen data={residentHome} />;
}
