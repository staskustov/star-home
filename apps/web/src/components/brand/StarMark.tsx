export function StarMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 2.5c.6 5.1 3.4 8.4 9.5 9.5-6.1 1.1-8.9 4.4-9.5 9.5-.6-5.1-3.4-8.4-9.5-9.5 6.1-1.1 8.9-4.4 9.5-9.5Z" />
    </svg>
  );
}
