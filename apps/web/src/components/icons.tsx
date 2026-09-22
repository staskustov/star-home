import type { ReactNode } from "react";
import type { NavItem } from "@/types/domain";

type IconName = NavItem["icon"] | "house" | "work" | "travel" | "menu" | "close";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M7 9.8V20h10V9.8" />
    </>
  ),
  house: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M7 9.8V20h10V9.8" />
    </>
  ),
  access: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  ai: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
  service: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0-5.6 5.6L4 17v3h3l4.9-4.9a4 4 0 0 0 5.6-5.6l-2.2 2.2-2-2 2.2-2.2Z" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c1.4-2.6 3.6-3.8 6.5-3.8s5.1 1.2 6.5 3.8" />
    </>
  ),
  overview: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  objects: (
    <>
      <path d="M4 20V9l6-4 6 4v11" />
      <path d="M10 20v-5h4v5" />
      <path d="M16 10h4v10h-4" />
    </>
  ),
  residents: (
    <>
      <circle cx="9" cy="9" r="2.6" />
      <circle cx="16" cy="10" r="2.2" />
      <path d="M4.5 18.5c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3" />
      <path d="M13 15.4c1.2-.3 2.4-.2 3.5.4 1 .6 1.7 1.6 2.2 2.7" />
    </>
  ),
  security: (
    <>
      <path d="M12 3.5 19 6.5v5.2c0 3.6-2.6 6.4-7 8.3-4.4-1.9-7-4.7-7-8.3V6.5L12 3.5Z" />
    </>
  ),
  requests: (
    <>
      <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13L15 17H7a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M8.5 9h7M8.5 12.5h5" />
    </>
  ),
  payments: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17" />
    </>
  ),
  devices: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
    </>
  ),
  work: (
    <>
      <rect x="3.5" y="8" width="17" height="11" rx="1.5" />
      <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" />
    </>
  ),
  travel: (
    <>
      <path d="M3 13.5 21 8l-6.5 10-2.2-4.2L3 13.5Z" />
      <path d="M12.2 13.7 8 20" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}

export const lifeModeIcon = {
  HOME: "house",
  WORK: "work",
  VACATION: "travel",
} as const;
