import type { Tone } from "@/types/domain";

export function MetricCard({
  value,
  label,
  tone = "info",
}: {
  value: string;
  label: string;
  tone?: Tone;
}) {
  const labelClass = tone === "danger" || tone === "warning" ? "text-danger" : "text-muted";
  return (
    <article className="panel px-5 py-5">
      <p className="text-[34px] leading-none font-medium tracking-[-0.05em] text-ink">{value}</p>
      <p className={`mt-3 text-sm ${labelClass}`}>{label}</p>
    </article>
  );
}
