import { redirect } from "next/navigation";
import type { DeskSection } from "@/server/ops-view";
import type { Permission } from "@/server/rbac/permissions";
import { rpc } from "@/server/rpc";
import type { DashboardView } from "@/types/dashboard";
import type { AccessEvent, AdminObjectSnapshot, NavGroup, ResidentHome } from "@/types/domain";

type HomeBody = { home?: ResidentHome; redirect?: string };
type PlacesBody = { name?: string; places?: { membershipId: string; title: string; meta: string }[]; redirect?: string };
type AdminBody = {
  companyName?: string;
  actorLabel?: string;
  objects?: AdminObjectSnapshot[];
  sections?: NavGroup[];
  permissions?: Permission[];
  redirect?: string;
};
type ProfileBody = {
  name: string;
  place: string | null;
  choosePlaces: boolean;
  adminMembershipId: string | null;
  notices: { id: string; title: string; body: string; at: string }[];
};
type AccessBody = {
  place: string;
  canCreate: boolean;
  passes: { id: string; guestName: string; detail: string; vehicle?: string; code?: string }[];
  points: { id: string; name: string; kind: string }[];
  events: AccessEvent[];
  redirect?: string;
};
type RequestsBody = { categories: string[]; requests: { id: string; category: string; text: string; status: string }[]; redirect?: string };

async function go(result: { status: number; body: { redirect?: string } }, fallback = "/no-access"): Promise<void> {
  if (result.status === 401) redirect("/");
  if (result.body.redirect) redirect(result.body.redirect);
  redirect(fallback);
}

export async function requireHome(): Promise<ResidentHome> {
  const result = await rpc<HomeBody>("home");
  if (result.status === 401 || result.body.redirect || !result.body.home) await go(result);
  return result.body.home as ResidentHome;
}

export async function requirePlaces(): Promise<{ name: string; places: { membershipId: string; title: string; meta: string }[] }> {
  const result = await rpc<PlacesBody>("places");
  if (result.status === 401 || result.body.redirect || !result.body.places || !result.body.name) await go(result);
  return { name: result.body.name as string, places: result.body.places as { membershipId: string; title: string; meta: string }[] };
}

export async function requireAdminContext(): Promise<{
  companyName: string;
  actorLabel: string;
  objects: AdminObjectSnapshot[];
  sections: NavGroup[];
  permissions: Permission[];
}> {
  const result = await rpc<AdminBody>("admin");
  if (result.status === 401 || result.body.redirect || !result.body.objects) await go(result, "/home");
  return {
    companyName: result.body.companyName ?? "",
    actorLabel: result.body.actorLabel ?? "",
    objects: result.body.objects as AdminObjectSnapshot[],
    sections: result.body.sections ?? [],
    permissions: result.body.permissions ?? [],
  };
}

export async function requireDashboard(): Promise<DashboardView> {
  const result = await rpc<DashboardView>("dashboard");
  if (result.status !== 200) await go({ status: result.status, body: {} }, "/no-access");
  return result.body;
}

export async function profileView(): Promise<ProfileBody> {
  const result = await rpc<ProfileBody>("profile");
  if (result.status === 401) redirect("/");
  return result.body;
}

export async function requireAccess(): Promise<AccessBody> {
  const result = await rpc<AccessBody>("access");
  if (result.status !== 200 || result.body.redirect || !result.body.place) await go(result);
  return result.body as AccessBody;
}

export async function requireRequests(): Promise<RequestsBody> {
  const result = await rpc<RequestsBody>("requests");
  if (result.status !== 200 || result.body.redirect || !result.body.categories) await go(result);
  return result.body as RequestsBody;
}

export async function requireDesk<T>(section: DeskSection): Promise<T> {
  const result = await rpc<T>("desk", { section });
  if (result.status === 401) redirect("/");
  if (result.status !== 200) redirect("/admin");
  return result.body;
}

export async function requireTree<T>(objectId: string): Promise<T> {
  const result = await rpc<T & { message?: string }>("tree", { objectId });
  if (result.status !== 200) redirect("/admin/objects");
  return result.body;
}

export async function requireResidents<T>(): Promise<T> {
  const result = await rpc<T>("residents");
  if (result.status !== 200) redirect("/admin");
  return result.body;
}

export async function requireSettings<T>(): Promise<T> {
  const result = await rpc<T>("settings");
  if (result.status !== 200) redirect("/admin");
  return result.body;
}

export async function requireSmartDevice(deviceId: string): Promise<{
  device: {
    id: string;
    name: string;
    typeLabel: string;
    roomName: string | null;
    availability: string;
    stale: boolean;
    lastSeen: string | null;
    capabilities: string[];
    state: Record<string, unknown>;
    canCommand: boolean;
    commands: import("@/server/smart-commands").SmartCommandName[];
    lastKnown?: boolean;
    favorite?: boolean;
  };
}> {
  const result = await rpc<{ device?: { id: string } | null; message?: string; redirect?: string }>("smartHomeDevice", { deviceId });
  if (result.status === 401) redirect("/");
  if (result.status !== 200 || !result.body.device) redirect("/devices");
  return result.body as unknown as { device: Awaited<ReturnType<typeof requireSmartDevice>>["device"] };
}

export async function requireFloorPlan(unitId?: string) {
  const result = await rpc<{ floors?: { floor: number; image: string; pins: { deviceId: string; name: string; x: number; y: number }[] }[] }>("floorPlan", { unitId });
  if (result.status === 401) redirect("/");
  return result.body.floors ?? [];
}

export async function requireScenarios() {
  const result = await rpc<{
    scenarios?: {
      id: string;
      name: string;
      description?: string;
      trigger: string;
      lifeMode: string | null;
      enabled?: boolean;
      scheduleHour?: number | null;
      scheduleMinute?: number | null;
      conditions?: { deviceId: string; field: string; value?: unknown }[];
      steps: { deviceId: string; command: string; value?: unknown }[];
    }[];
  }>("listScenarios");
  if (result.status === 401) redirect("/");
  return result.body.scenarios ?? [];
}

export async function requireSmartRooms() {
  const result = await rpc<{
    rooms?: {
      id: string;
      name: string;
      kind: string;
      deviceCount: number;
      temperatureC: number | null;
      humidityPercent: number | null;
      lights: { on: number; total: number } | null;
      curtain: number | null;
    }[];
  }>("smartHomeRooms");
  if (result.status === 401) redirect("/");
  return result.body.rooms ?? [];
}

export async function requireRoom(roomId: string) {
  const result = await rpc<{
    room?: { id: string; name: string };
    devices?: {
      id: string;
      name: string;
      typeLabel: string;
      stale: boolean;
      availability: "ONLINE" | "OFFLINE" | "UNKNOWN";
      canCommand: boolean;
      commands: import("@/server/smart-commands").SmartCommandName[];
      state?: Record<string, unknown>;
    }[];
  }>("smartHomeRoomDevices", { roomId });
  if (result.status === 401) redirect("/");
  if (result.status !== 200 || !result.body.room) redirect("/rooms");
  return { room: result.body.room, devices: result.body.devices ?? [] };
}

export async function requireSmartEvents() {
  const result = await rpc<{
    events?: { id: string; title: string; at: string; result: string; deviceId: string | null; severity?: string; source?: string }[];
  }>("smartHomeEvents");
  if (result.status === 401) redirect("/");
  return result.body.events ?? [];
}

export async function requireGuest(): Promise<{ name: string; pass: { guestName: string; detail: string; code?: string } | null }> {
  const result = await rpc<{ name?: string; pass: { guestName: string; detail: string; code?: string } | null; redirect?: string }>("guest");
  if (result.status === 401 || result.body.redirect || !result.body.name) await go(result);
  return { name: result.body.name as string, pass: result.body.pass };
}
