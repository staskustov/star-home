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
    <article className="rounded-[20px] border border-line bg-surface px-5 py-5">
      <p className="text-[32px] leading-none tracking-[-0.04em] text-ink">{value}</p>
      <p className={`mt-3 text-sm ${labelClass}`}>{label}</p>
    </article>
  );
}
