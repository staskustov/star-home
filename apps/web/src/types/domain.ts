export const objectTypes = [
  "COTTAGE_COMMUNITY",
  "RESIDENTIAL_COMPLEX",
  "APARTMENT_COMPLEX",
  "APARTMENT_BUILDING",
  "MULTI_FAMILY_BUILDING",
  "CUSTOM",
] as const;

export type ObjectType = (typeof objectTypes)[number];

export const lifeModes = ["HOME", "WORK", "VACATION"] as const;

export type LifeMode = (typeof lifeModes)[number];

export const roles = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "OBJECT_ADMIN",
  "MANAGER",
  "SECURITY",
  "SERVICE_OPERATOR",
  "RESIDENT",
  "FAMILY_MEMBER",
  "GUEST",
] as const;

export type Role = (typeof roles)[number];

export type Tone = "success" | "warning" | "danger" | "info";

export type Membership = {
  id: string;
  userId: string;
  companyId: string;
  role: Role;
  objectId: string | null;
  unitId: string | null;
};

export type Company = {
  id: string;
  name: string;
};

export type ResidentialObject = {
  id: string;
  companyId: string;
  name: string;
  type: ObjectType;
  address: string;
};

export type Unit = {
  id: string;
  objectId: string;
  buildingId: string | null;
  name: string;
  number: string;
  type: "HOUSE" | "APARTMENT" | "APARTMENT_UNIT" | "TOWNHOUSE" | "ROOM" | "PARKING" | "CUSTOM";
};

export const lifeModeChecks = [
  { id: "leak", label: "Протечки" },
  { id: "temperature", label: "Температура" },
  { id: "power", label: "Электричество" },
  { id: "access", label: "Доступ" },
] as const;

export type LifeModeCheck = (typeof lifeModeChecks)[number]["id"];

export type LifeModeSetting = {
  mode: LifeMode;
  label: string;
  summary: string;
  detail: string;
  securityLabel: string;
  securityTone: Tone;
  climate: string;
  lighting: string;
  security: string;
  notifications: string;
  checks: LifeModeCheck[];
};

export type QuickAction = {
  id: string;
  label: string;
};

export type VisitorPreview = {
  title: string;
  detail: string;
};

export type Money = {
  amount: number;
  currency: string;
};

export type ResidentHome = {
  company: Company;
  object: ResidentialObject;
  unit: Unit;
  residentName: string;
  lifeModes: LifeModeSetting[];
  activeLifeMode: LifeMode;
  climate: {
    temperatureC: number;
    humidityPercent: number;
  } | null;
  quickActions: QuickAction[];
  visitor: VisitorPreview | null;
  balance: Money | null;
  todayEvent: {
    title: string;
    detail: string;
  } | null;
  serviceCategories: string[];
  aiPrompt: string;
};

export type AccessEvent = {
  id: string;
  time: string;
  title: string;
  result: "SUCCESS" | "DENIED" | "UNCONFIRMED";
};

export type SystemState = {
  id: string;
  name: string;
  state: string;
  tone: Tone;
};

export type AdminObjectSnapshot = {
  id: string;
  companyId: string;
  name: string;
  type: ObjectType;
  buildings: number | null;
  units: number;
  residents: number;
  visitors: number;
  requests: number;
  alarms: number;
  accessEvents: AccessEvent[];
  systems: SystemState[];
};

export type AdminDashboard = {
  company: Company;
  actorLabel: string;
  objects: AdminObjectSnapshot[];
};

export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "access" | "ai" | "service" | "profile" | "overview" | "objects" | "residents" | "security" | "requests" | "payments" | "devices" | "settings";
};
