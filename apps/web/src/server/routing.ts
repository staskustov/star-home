import { adminMemberships, findMembership, guestMemberships, homeMemberships, isAdminRole } from "@/server/directory";
import { can, staffActor } from "@/server/rbac/decide";
import { firstSection, sectionPermission } from "@/server/rbac/sections";

function guestOpen(userId: string, membershipId: string | null): boolean {
  const selected = membershipId ? findMembership(userId, membershipId) : undefined;
  if (selected?.role === "GUEST") return guestMemberships(userId).some((membership) => membership.id === selected.id);
  return false;
}

export function destinationFor(userId: string, membershipId: string | null): string {
  const selected = membershipId ? findMembership(userId, membershipId) : undefined;
  const homes = homeMemberships(userId);
  const guests = guestMemberships(userId);
  const admins = adminMemberships(userId);
  if (selected?.role === "GUEST") return guestOpen(userId, membershipId) ? "/guest" : "/no-access";
  if (selected && (selected.role === "RESIDENT" || selected.role === "FAMILY_MEMBER") && selected.unitId) return "/home";
  if (selected && isAdminRole(selected.role)) return selected.role === "SECURITY" ? securityPath : "/admin";
  if (homes.length > 1) return "/my-objects";
  if (homes.length === 1) return "/home";
  if (guests.length === 1) return "/guest";
  if (admins.length > 0) return admins[0]?.role === "SECURITY" ? securityPath : "/admin";
  return "/no-access";
}

const securityPath = "/security";
const residentPaths = ["/home", "/access", "/rooms", "/devices", "/service", "/profile", "/my-objects"];
const adminPrefix = "/admin";

export function guardPath(userId: string, membershipId: string | null, pathname: string): { redirect?: string } {
  const destination = destinationFor(userId, membershipId);
  const selected = membershipId ? findMembership(userId, membershipId) : undefined;
  const guest = selected?.role === "GUEST";
  if (pathname === "/guest") {
    if (destination !== "/guest") return { redirect: destination };
    return {};
  }
  if (pathname === securityPath || pathname.startsWith(`${securityPath}/`)) {
    const actor = staffActor({ userId, membershipId });
    if (!actor.ok) return { redirect: destination === securityPath ? "/no-access" : destination };
    if (can(actor.value, "security.view")) return {};
    return { redirect: firstSection(actor.value) ?? "/no-access" };
  }
  if (pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`)) {
    const actor = staffActor({ userId, membershipId });
    if (!actor.ok) return { redirect: destination === adminPrefix ? "/no-access" : destination };
    const permission = sectionPermission(pathname);
    if (!permission || can(actor.value, permission)) return {};
    const fallback = firstSection(actor.value);
    return { redirect: fallback && fallback !== pathname ? fallback : "/no-access" };
  }
  if (pathname === "/profile") {
    if (guest) return { redirect: destination };
    return {};
  }
  if (pathname === "/my-objects") {
    if (homeMemberships(userId).length < 2) return { redirect: destination };
    return {};
  }
  if (residentPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    if (guest) return { redirect: destination };
    const home = selected && (selected.role === "RESIDENT" || selected.role === "FAMILY_MEMBER") && selected.unitId;
    if (!home) return { redirect: destination };
  }
  if (pathname === "/no-access" && destination !== "/no-access") return { redirect: destination };
  return {};
}

export function initialMembershipId(userId: string): string | null {
  const homes = homeMemberships(userId);
  const guests = guestMemberships(userId);
  const admins = adminMemberships(userId);
  if (homes.length === 1) return homes[0]?.id ?? null;
  if (homes.length > 1) return null;
  if (guests.length === 1) return guests[0]?.id ?? null;
  return admins[0]?.id ?? null;
}
