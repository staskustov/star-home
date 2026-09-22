import { adminMemberships, findMembership, homeMemberships, isAdminRole } from "@/server/directory";

export function destinationFor(userId: string, membershipId: string | null): string {
  const selected = membershipId ? findMembership(userId, membershipId) : undefined;
  const homes = homeMemberships(userId);
  const admins = adminMemberships(userId);
  if (selected && selected.role === "RESIDENT" && selected.unitId) return "/home";
  if (selected && isAdminRole(selected.role)) return "/admin";
  if (homes.length > 1) return "/my-objects";
  if (homes.length === 1) return "/home";
  if (admins.length > 0) return "/admin";
  return "/no-access";
}

export function initialMembershipId(userId: string): string | null {
  const homes = homeMemberships(userId);
  const admins = adminMemberships(userId);
  if (homes.length === 1) return homes[0]?.id ?? null;
  if (homes.length > 1) return null;
  return admins[0]?.id ?? null;
}
