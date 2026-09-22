export function ResponsiveContainer({
  children,
  width = "narrow",
}: {
  children: React.ReactNode;
  width?: "narrow" | "wide";
}) {
  const maxWidth = width === "narrow" ? "max-w-[400px]" : "max-w-[1120px]";
  return <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>;
}
