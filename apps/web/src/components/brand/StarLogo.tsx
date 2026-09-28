export function StarLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#f04444" />
      <path
        fill="#ffffff"
        transform="translate(16 16) scale(0.82) translate(-12 -12)"
        d="M12 2.5c.6 5.1 3.4 8.4 9.5 9.5-6.1 1.1-8.9 4.4-9.5 9.5-.6-5.1-3.4-8.4-9.5-9.5 6.1-1.1 8.9-4.4 9.5-9.5Z"
      />
    </svg>
  );
}
