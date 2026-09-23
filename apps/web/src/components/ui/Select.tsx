import type { SelectHTMLAttributes } from "react";

export function Select({
  wrapClassName = "",
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }) {
  return (
    <span className={`select-wrap ${wrapClassName}`}>
      <select className={`control ${className}`} {...props}>
        {children}
      </select>
      <svg viewBox="0 0 20 20" className="select-chevron" aria-hidden>
        <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
