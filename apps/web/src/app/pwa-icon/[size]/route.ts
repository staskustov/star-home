import { readFile } from "fs/promises";
import path from "path";

const files: Record<string, string> = {
  "16": "icon-16.png",
  "32": "icon-32.png",
  "48": "icon-48.png",
  favicon: "icon-48.png",
  "180": "icon-180.png",
  "192": "icon-192.png",
  "512": "icon-512.png",
  "1024": "app-icon-1024.png",
  maskable: "icon-maskable-512.png",
};

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const name = files[size];
  if (!name) return new Response("Not found", { status: 404 });
  const candidates = [
    path.join(process.cwd(), "public/brand/icons", name),
    path.join(process.cwd(), "apps/web/public/brand/icons", name),
  ];
  let bytes: Buffer | null = null;
  for (const file of candidates) {
    try {
      bytes = await readFile(file);
      break;
    } catch {
      bytes = null;
    }
  }
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
