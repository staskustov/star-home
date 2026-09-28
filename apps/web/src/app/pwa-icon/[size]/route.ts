import { NextResponse } from "next/server";

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

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const name = files[size];
  if (!name) return new Response("Not found", { status: 404 });
  return NextResponse.redirect(new URL(`/brand/icons/${name}`, request.url), 308);
}
