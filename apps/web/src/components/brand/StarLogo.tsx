export function StarLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/star-logo-mark.png" alt="" className={`star-logo ${className}`} />
  );
}
