import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { CameraWall } from "@/components/security/CameraWall";
import { rpc } from "@/server/rpc";
import type { SecurityCameraWall } from "@/types/security";

export const metadata: Metadata = { title: "Камеры · STAR HOME" };

export default async function CamerasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { object } = await searchParams;
  const result = await rpc<SecurityCameraWall>("securityCameras", { objectId: Array.isArray(object) ? object[0] : object });
  if (result.status === 401) redirect("/");
  if ((result.status === 403 || result.status === 404) && object) redirect("/security/cameras");
  if (result.status !== 200) redirect("/security");
  return (
    <>
      <LiveRefresh />
      <CameraWall wall={result.body} />
    </>
  );
}
