import { AccessPanel } from "@/components/access/AccessPanel";
import { requireAccess } from "@/server/access";
import { passQr } from "@/server/pass-qr";

export default async function AccessPage() {
  const access = await requireAccess();
  const passes = await Promise.all(
    access.passes.map(async (pass) => ({ ...pass, qr: pass.code ? await passQr(pass.code) : "" })),
  );
  return <AccessPanel place={access.place} canCreate={access.canCreate} passes={passes} points={access.points} events={access.events} />;
}
