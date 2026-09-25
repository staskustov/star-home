import { ImageResponse } from "next/og";
import { AppIconMark, FaviconMark } from "@/server/app-mark";

const sizes: Record<string, { canvas: number; markRatio: number; kind: "app" | "favicon" }> = {
  "32": { canvas: 32, markRatio: 1, kind: "favicon" },
  "48": { canvas: 48, markRatio: 1, kind: "favicon" },
  favicon: { canvas: 48, markRatio: 1, kind: "favicon" },
  "180": { canvas: 180, markRatio: 0.86, kind: "app" },
  "192": { canvas: 192, markRatio: 0.86, kind: "app" },
  "512": { canvas: 512, markRatio: 0.86, kind: "app" },
  maskable: { canvas: 512, markRatio: 0.62, kind: "app" },
};

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const spec = sizes[size];
  if (!spec) return new Response("Not found", { status: 404 });

  const mark = spec.kind === "favicon" ? <FaviconMark canvas={spec.canvas} /> : <AppIconMark canvas={spec.canvas} markRatio={spec.markRatio} />;
  return new ImageResponse(mark, { width: spec.canvas, height: spec.canvas });
}
