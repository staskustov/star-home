import { residentHome } from "@/mocks/resident-home";
import { findBuilding, findCompany, findObject, findUnit } from "@/server/catalog-store";
import { modeForUnit, modesForObject } from "@/server/life-mode-store";
import { listMemberships, listUsers, personName, type StoredUser } from "@/server/people-store";
import { staffRoles } from "@/server/rbac/policy";
import type { Membership, ResidentHome, Role } from "@/types/domain";

export type DirectoryUser = StoredUser;

function users(): DirectoryUser[] {
  return listUsers();
}

export function isLive(membership: Membership): boolean {
  return membership.status !== "REVOKED";
}

function memberships(): Membership[] {
  return listMemberships().filter(isLive);
}

const parkHome: ResidentHome = {
  ...residentHome,
  residentName: "",
  object: {
    id: "obj_park",
    companyId: "cmp_star",
    name: "ЖК Парк Лайт",
    type: "RESIDENTIAL_COMPLEX",
    address: "Москва",
  },
  unit: {
    id: "unit_84",
    objectId: "obj_park",
    buildingId: "bld_2",
    name: "Квартира №84",
    number: "84",
    type: "APARTMENT",
  },
  climate: { temperatureC: 21.1, humidityPercent: 41 },
  visitor: { title: "Гость", detail: "Завтра, корпус 2" },
  balance: { amount: 8600, currency: "RUB" },
  todayEvent: { title: "Событие", detail: "Пропуск на корпус 2" },
};

const homesByUnit: Record<string, ResidentHome> = {
  unit_24: residentHome,
  unit_84: parkHome,
};


export function findUserByLogin(login: string): DirectoryUser | undefined {
  const key = login.trim().toLowerCase();
  return users().find((user) => user.login === key);
}

export function findUserById(userId: string): DirectoryUser | undefined {
  return users().find((user) => user.id === userId);
}

export function membershipsOf(userId: string): Membership[] {
  return memberships().filter((membership) => membership.userId === userId);
}

export function findMembership(userId: string, membershipId: string): Membership | undefined {
  return membershipsOf(userId).find((membership) => membership.id === membershipId && stillActive(membership));
}

export function isAdminRole(role: Role): boolean {
  return staffRoles.includes(role);
}

function stillActive(membership: Membership): boolean {
  if (!membership.expiresAt) return true;
  return Date.parse(membership.expiresAt) > Date.now();
}

export function homeMemberships(userId: string): Membership[] {
  return membershipsOf(userId).filter(
    (membership) => (membership.role === "RESIDENT" || membership.role === "FAMILY_MEMBER") && membership.unitId && stillActive(membership),
  );
}

export function guestMemberships(userId: string): Membership[] {
  return membershipsOf(userId).filter((membership) => membership.role === "GUEST" && membership.unitId && stillActive(membership));
}

export function adminMemberships(userId: string): Membership[] {
  return membershipsOf(userId).filter((membership) => isAdminRole(membership.role));
}

export function objectHasAssignments(objectId: string, unitIds: readonly string[]): boolean {
  const units = new Set(unitIds);
  return memberships().some(
    (membership) => membership.objectId === objectId || (membership.unitId !== null && units.has(membership.unitId)),
  );
}

export function unitHasAssignment(unitId: string): boolean {
  return memberships().some((membership) => membership.unitId === unitId);
}

export function buildingHasStaff(buildingId: string): boolean {
  return memberships().some((membership) => membership.buildingId === buildingId);
}

export function residentCount(objectId: string, keep: (unitId: string | null) => boolean = () => true): number {
  return memberships().filter(
    (membership) =>
      (membership.role === "RESIDENT" || membership.role === "FAMILY_MEMBER") &&
      membership.objectId === objectId &&
      stillActive(membership) &&
      keep(membership.unitId),
  ).length;
}

export function homeFor(user: DirectoryUser, membership: Membership): ResidentHome | null {
  if (!membership.unitId) return null;
  const unit = findUnit(membership.unitId);
  const object = unit ? findObject(unit.objectId) : undefined;
  const known = homesByUnit[membership.unitId];
  if (!unit || !object || object.companyId !== membership.companyId) return null;
  const company = findCompany(object.companyId);
  const home = known ?? {
    ...residentHome,
    climate: null,
    visitor: null,
    balance: null,
    todayEvent: null,
  };
  return {
    ...home,
    residentName: personName(user),
    company: { id: object.companyId, name: company?.name ?? home.company.name },
    object: {
      id: object.id,
      companyId: object.companyId,
      name: object.name,
      type: object.type,
      address: object.address,
      securityPhone: object.securityPhone ?? null,
    },
    unit: {
      id: unit.id,
      objectId: unit.objectId,
      buildingId: unit.buildingId,
      name: unit.name,
      number: unit.number,
      type: unit.type,
    },
    lifeModes: modesForObject(object.id),
    activeLifeMode: modeForUnit(unit.id),
  };
}

export function placesFor(userId: string): { membershipId: string; title: string; meta: string }[] {
  const user = findUserById(userId);
  if (!user) return [];
  return homeMemberships(userId).flatMap((membership) => {
    const home = homeFor(user, membership);
    if (!home) return [];
    const building = home.unit.buildingId ? findBuilding(home.unit.buildingId) : undefined;
    const meta = building ? `${home.object.name} · ${building.name}` : home.object.name;
    return [{ membershipId: membership.id, title: home.unit.name, meta }];
  });
}

export function companyName(companyId: string): string {
  return findCompany(companyId)?.name ?? "";
}
