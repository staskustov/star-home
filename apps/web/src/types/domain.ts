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
  "ACCOUNTANT",
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
  buildingId?: string | null;
  unitId: string | null;
  expiresAt?: string | null;
  passId?: string | null;
  status?: "ACTIVE" | "REVOKED";
  createdAt?: string | null;
  createdBy?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
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
  securityPhone?: string | null;
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
  weather?: {
    temperatureC: number | null;
    humidityPercent: number | null;
    windMs: number | null;
    radiationUSv: number | null;
    co2Ppm?: number | null;
    organics?: number | null;
    metrics?: { key: string; label: string; icon: string; color: string; value: string }[];
  } | null;
  scenarioChips?: {
    id: string;
    name: string;
    icon: string;
    strip: "scenarios" | "actions";
    kind: "LIFE_MODE" | "SCENARIO" | "ACTION";
    lifeMode?: LifeMode;
    scenarioId?: string | null;
    action?: string | null;
    deviceId?: string | null;
    latch?: "OPEN" | "CLOSED";
    stale?: boolean;
  }[];
  actionChips?: {
    id: string;
    name: string;
    icon: string;
    strip: "scenarios" | "actions";
    kind: "LIFE_MODE" | "SCENARIO" | "ACTION";
    lifeMode?: LifeMode;
    scenarioId?: string | null;
    action?: string | null;
    deviceId?: string | null;
    latch?: "OPEN" | "CLOSED";
    stale?: boolean;
  }[];
  quickActions: QuickAction[];
  visitor: VisitorPreview | null;
  balance: Money | null;
  todayEvent: {
    title: string;
    detail: string;
  } | null;
  todayRequest: {
    title: string;
    detail: string;
  } | null;
  paymentHistory: { title: string; amount: number; currency: string }[];
  categories: string[];
  rooms: { id?: string; name: string; deviceCount?: number; temperatureC?: number | null; humidityPercent?: number | null }[];
  cameras: { id?: string; name: string; state: string; hasFrame?: boolean }[];
  devices: {
    id?: string;
    name: string;
    label: string;
    kind?: string;
    state: "ON" | "OFF" | "FAULT";
    power?: boolean;
    latch?: "OPEN" | "CLOSED";
    commands?: string[];
    stale?: boolean;
    roomId?: string | null;
    roomName?: string | null;
    favorite?: boolean;
  }[];
  serviceCategories: string[];
  aiPrompt: string;
  meters: { name: string; value: string; unit: string }[];
  securityPhone?: string | null;
  canSecurity?: boolean;
  canGate?: boolean;
  canCommand?: boolean;
  canPay?: boolean;
  canPass?: boolean;
  cover?: string;
  canEditCover?: boolean;
  guestCount?: number;
  securityStatus?: string;
  facts?: {
    lights: { on: number; total: number } | null;
    doors: { open: string[] } | null;
    energy: { watts?: number; kwh?: number } | null;
    alerts: string[];
  };
  controller?: {
    status: string;
    lastSeen: string | null;
    stale: boolean;
    message: string | null;
    gateways?: { name: string; status: string; lastSeen: string | null; stale: boolean }[];
  } | null;
  notices?: { id: string; title: string; body: string; at: string; severity?: string; readAt?: string | null }[];
  accessPoints?: {
    id: string;
    name: string;
    kind: string;
    latch?: "OPEN" | "CLOSED";
    status?: string;
    ready?: boolean;
  }[];
};

export type AccessEvent = {
  id: string;
  time: string;
  title: string;
  result: "SUCCESS" | "DENIED" | "UNCONFIRMED";
};

export type AdminObjectSnapshot = {
  id: string;
  companyId: string;
  name: string;
  type: ObjectType;
  address: string;
  securityPhone?: string | null;
  buildings: number | null;
  units: number;
  canDelete: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "access" | "ai" | "service" | "profile" | "overview" | "objects" | "residents" | "security" | "requests" | "payments" | "devices" | "settings" | "scenarios" | "rooms" | "team" | "roles" | "audit" | "engineering" | "event";
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};
