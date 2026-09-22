import { ImageResponse } from "next/og";

const sizes: Record<string, { canvas: number; markRatio: number }> = {
  "180": { canvas: 180, markRatio: 0.62 },
  "192": { canvas: 192, markRatio: 0.62 },
  "512": { canvas: 512, markRatio: 0.62 },
  maskable: { canvas: 512, markRatio: 0.42 },
};

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const spec = sizes[size];
  if (!spec) return new Response("Not found", { status: 404 });

  const mark = Math.round(spec.canvas * spec.markRatio);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F6F4F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: mark,
            height: mark,
            borderRadius: Math.round(mark * 0.22),
            background: "#1F3A34",
            color: "#F7F5F1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.round(mark * 0.34),
            fontWeight: 600,
            letterSpacing: -1,
          }}
        >
          SH
        </div>
      </div>
    ),
    { width: spec.canvas, height: spec.canvas },
  );
}
