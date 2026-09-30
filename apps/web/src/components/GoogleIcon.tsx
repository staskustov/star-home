import { deviceIconColorOf, deviceIconOf } from "@/lib/google-icons";

export function GoogleIcon({
  name,
  kind,
  filled = false,
  className = "",
  size,
  title,
  color,
}: {
  name?: string | null;
  kind?: string;
  filled?: boolean;
  className?: string;
  size?: number;
  title?: string;
  color?: string | null;
}) {
  const icon = deviceIconOf(name, kind);
  const hex = deviceIconColorOf(color);
  return (
    <span
      className={`g-icon ${className}`.trim()}
      title={title}
      aria-hidden={!title}
      style={{
        fontSize: size,
        color: hex || undefined,
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : undefined,
      }}
    >
      {icon}
    </span>
  );
}

export function DeviceTileIcon({
  name,
  kind,
  color,
  filled = false,
  size = 18,
  className = "",
}: {
  name?: string | null;
  kind?: string;
  color?: string | null;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  const hex = deviceIconColorOf(color);
  return (
    <span
      className={`tile-icon ${className}`.trim()}
      style={hex ? { color: hex, background: `color-mix(in srgb, ${hex} 18%, transparent)` } : undefined}
    >
      <GoogleIcon name={name} kind={kind} filled={filled} size={size} />
    </span>
  );
}
