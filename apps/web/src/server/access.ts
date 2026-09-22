import { redirect } from "next/navigation";
import {
  adminMemberships,
  adminObjectsFor,
  companyName,
  findMembership,
  findUserById,
  homeFor,
  homeMemberships,
  isAdminRole,
  placesFor,
} from "@/server/directory";
import { destinationFor } from "@/server/routing";
import { readSession } from "@/server/session";
import type { AdminObjectSnapshot, ResidentHome } from "@/types/domain";

export { destinationFor, initialMembershipId } from "@/server/routing";

export async function requireHome(): Promise<ResidentHome> {
  const session = await readSession();
  if (!session) redirect("/");
  const user = findUserById(session.userId);
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!user || !membership) redirect(destinationFor(session.userId, null));
  const home = homeFor(user, membership);
  if (!home) redirect(destinationFor(session.userId, null));
  return home;
}

export async function requirePlaces(): Promise<{ name: string; places: { membershipId: string; title: string; meta: string }[] }> {
  const session = await readSession();
  if (!session) redirect("/");
  const user = findUserById(session.userId);
  if (!user) redirect("/");
  const places = placesFor(session.userId);
  if (places.length < 2) redirect(destinationFor(session.userId, session.membershipId));
  return { name: user.name, places };
}

export async function requireAdminContext(): Promise<{
  companyName: string;
  actorLabel: string;
  objects: AdminObjectSnapshot[];
}> {
  const session = await readSession();
  if (!session) redirect("/");
  const user = findUserById(session.userId);
  const admins = adminMemberships(session.userId);
  const selected = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const membership = selected && isAdminRole(selected.role) ? selected : admins[0];
  if (!user || !membership) redirect(destinationFor(session.userId, session.membershipId));
  return {
    companyName: companyName(membership.companyId),
    actorLabel: user.name,
    objects: adminObjectsFor(membership),
  };
}

export async function profileView(): Promise<{
  name: string;
  place: string | null;
  choosePlaces: boolean;
  adminMembershipId: string | null;
}> {
  const session = await readSession();
  if (!session) redirect("/");
  const user = findUserById(session.userId);
  if (!user) redirect("/");
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const home = membership ? homeFor(user, membership) : null;
  const admin = adminMemberships(session.userId)[0];
  return {
    name: user.name,
    place: home ? `${home.object.name} · ${home.unit.name}` : null,
    choosePlaces: homeMemberships(session.userId).length > 1,
    adminMembershipId: admin?.id ?? null,
  };
}
