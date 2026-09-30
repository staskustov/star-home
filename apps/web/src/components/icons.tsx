import type { ReactNode } from "react";
import type { NavItem } from "@/types/domain";

export type IconName =
  | NavItem["icon"]
  | "house"
  | "work"
  | "travel"
  | "menu"
  | "close"
  | "gate"
  | "guests"
  | "thermo"
  | "drop"
  | "camera"
  | "chevron"
  | "leak"
  | "lock"
  | "climate"
  | "meter"
  | "event"
  | "phone"
  | "bell"
  | "night"
  | "wind"
  | "radiation"
  | "co2"
  | "organics"
  | "edit"
  | "plus"
  | "light";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M7 9.8V20h10V9.8" />
    </>
  ),
  house: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M16 6.9V4.8h2.2v3.9" />
      <path d="M5.8 9.4v9.1a1.5 1.5 0 0 0 1.5 1.5h9.4a1.5 1.5 0 0 0 1.5-1.5V9.4" />
      <path d="M10 20v-4.2a2 2 0 0 1 4 0V20" />
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
  team: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <circle cx="9" cy="10.6" r="2" />
      <path d="M5.9 15.5c.6-1.3 1.7-2 3.1-2s2.5.7 3.1 2" />
      <path d="M14.5 10h3M14.5 13h3" />
    </>
  ),
  roles: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12h9M17.5 12v3M20.5 12v2" />
    </>
  ),
  audit: (
    <>
      <path d="M7 3.5h8l4 4v13H7z" />
      <path d="M15 3.5v4h4M10 12h6M10 15.5h6M10 19h3.5" />
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
  rooms: (
    <>
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
    </>
  ),
  devices: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  engineering: (
    <>
      <path d="M4.5 17a7.5 7.5 0 1 1 15 0" />
      <path d="m12 17 3.5-4.5M4.5 17h3M16.5 17h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-1.8-3.1-2.2.5a7.7 7.7 0 0 0-2.6-1.5L14 2.8h-4l-.6 2.2a7.7 7.7 0 0 0-2.6 1.5l-2.2-.5-1.8 3.1L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.8 1.4 1.8 3.1 2.2-.5a7.7 7.7 0 0 0 2.6 1.5l.6 2.2h4l.6-2.2a7.7 7.7 0 0 0 2.6-1.5l2.2.5 1.8-3.1-1.8-1.4Z" />
    </>
  ),
  scenarios: (
    <>
      <rect x="4" y="4.5" width="16" height="5" rx="1.6" />
      <rect x="4" y="14.5" width="16" height="5" rx="1.6" />
      <path d="M8 7h.01M8 17h.01M11 7h5M11 17h5" />
    </>
  ),
  work: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3.5 12.5c5.4 1.7 11.6 1.7 17 0" />
      <path d="M10.8 13.2v1.6h2.4v-1.6" />
    </>
  ),
  travel: (
    <>
      <path d="M20.6 15.4v-1.7L13.4 9V4.6a1.4 1.4 0 0 0-2.8 0V9l-7.2 4.7v1.7l7.2-2.2v4.9l-1.9 1.4V21l3.3-.9 3.3.9v-1.5l-1.9-1.4v-4.9l7.2 2.2Z" />
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
  gate: (
    <>
      <path d="M4 20V6M20 20V6M4 8h16M4 20h16" />
      <path d="M8 8v12M12 8v12M16 8v12" />
    </>
  ),
  guests: (
    <>
      <circle cx="10" cy="8.5" r="3" />
      <path d="M4.5 19c1-2.8 3-4.2 5.5-4.2s4.5 1.4 5.5 4.2" />
      <path d="M17.5 9v5M15 11.5h5" />
    </>
  ),
  thermo: (
    <>
      <path d="M10 14.2V5.5a2 2 0 1 1 4 0v8.7a3.8 3.8 0 1 1-4 0Z" />
      <path d="M12 10.5v5" />
    </>
  ),
  drop: (
    <>
      <path d="M12 3.8c3.4 4 5.5 7.1 5.5 9.7a5.5 5.5 0 0 1-11 0c0-2.6 2.1-5.7 5.5-9.7Z" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3v9H4v-9Z" />
      <circle cx="12" cy="13" r="2.5" />
    </>
  ),
  chevron: (
    <>
      <path d="m9.5 6 6 6-6 6" />
    </>
  ),
  leak: (
    <>
      <path d="M12 4c2.6 3.1 4.2 5.4 4.2 7.4a4.2 4.2 0 0 1-8.4 0C7.8 9.4 9.4 7.1 12 4Z" />
      <path d="M5 20h14" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="11" width="13" height="9" rx="1.8" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  climate: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    </>
  ),
  meter: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 13l3.5-3.5M12 6V4.5" />
    </>
  ),
  event: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  phone: (
    <>
      <path d="M8.2 4.8c.4-.4 1-.5 1.5-.3l1.8.6c.5.2.8.7.8 1.3v1.6c0 .4-.2.8-.5 1.1L10.5 11c.6 1.3 1.7 2.4 3 3l1.9-1.3c.3-.2.7-.3 1.1-.2h1.6c.6 0 1.1.3 1.3.8l.6 1.8c.2.5.1 1.1-.3 1.5l-1 1c-.5.5-1.2.7-1.9.5C12.4 18.3 5.7 11.6 5.2 7.2c-.2-.7 0-1.4.5-1.9l2.5-.5Z" />
    </>
  ),
  bell: (
    <>
      <path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 4.2 1.4 5.4 1.4 5.4H4.8s1.4-1.2 1.4-5.4Z" />
      <path d="M10 19.2a2 2 0 0 0 4 0" />
    </>
  ),
  night: (
    <>
      <path d="M16.4 14.6A6.6 6.6 0 0 1 9.2 5.8 7 7 0 1 0 16.4 14.6Z" />
    </>
  ),
  wind: (
    <>
      <path d="M4 10h11a2.4 2.4 0 1 0-2.2-3.4" />
      <path d="M4 14h13.2a2.6 2.6 0 1 1-2.4 3.6" />
    </>
  ),
  radiation: (
    <>
      <circle cx="12" cy="12" r="1.4" />
      <path d="M12 6.2 9.6 10.4A4 4 0 0 1 12 9.6a4 4 0 0 1 2.4.8Z" />
      <path d="m7.1 16.6 4.3-1.2A4 4 0 0 1 9.6 13.2 4 4 0 0 1 8.4 15Z" />
      <path d="m16.9 16.6-4.3-1.2A4 4 0 0 0 14.4 13.2 4 4 0 0 0 15.6 15Z" />
    </>
  ),
  co2: (
    <>
      <circle cx="8.5" cy="13" r="3" />
      <circle cx="15.5" cy="11" r="2.4" />
      <path d="M5 18.5h14" />
    </>
  ),
  organics: (
    <>
      <path d="M12 20V9" />
      <path d="M12 9c0-4 4.2-6 7-6-1 4.2-4 6.4-7 6.4" />
      <path d="M12 11c0-3.4-3.8-5.4-6.5-5.4 1 3.6 3.5 5.4 6.5 5.4" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z" />
      <path d="M13.2 6.6 17.4 10.8" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  light: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a5.2 5.2 0 0 0-3.1 9.4c.6.5 1.1 1.3 1.1 2.1h4c0-.8.5-1.6 1.1-2.1A5.2 5.2 0 0 0 12 3Z" />
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
