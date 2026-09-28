export function StarLogo({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/star-logo-mark.png" alt="" className={`star-logo ${className}`} />
  );
}
