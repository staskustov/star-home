import type { Tone } from "@/types/domain";

export type DashboardTone = Exclude<Tone, "info">;

export type DashboardAttention = {
  id: string;
  tone: DashboardTone;
  title: string;
  detail: string;
  href: string;
};

export type DashboardPulse = {
  id: "units" | "residents" | "guests" | "requests" | "alarms" | "access" | "invoices";
  value: number;
  label: string;
  href: string;
  alert: boolean;
};

export type DashboardSystem = {
  id: string;
  name: string;
  state: string;
  tone: DashboardTone;
};

export type DashboardFeedItem = {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: DashboardTone;
};

export type DashboardObject = {
  id: string;
  name: string;
  typeLabel: string;
  address: string;
  securityPhone?: string | null;
  canDelete: boolean;
  status: { tone: DashboardTone; title: string; detail: string };
  attention: DashboardAttention[];
  pulse: DashboardPulse[];
  systems: DashboardSystem[] | null;
  feed: DashboardFeedItem[] | null;
};

export type DashboardView = {
  scope: "COMPANY" | "OBJECT";
  canCreateObject: boolean;
  canEditObject: boolean;
  canDeleteObject: boolean;
  canEditStructure: boolean;
  objects: DashboardObject[];
};
