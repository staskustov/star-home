import { findBuilding, findUnit, readTree } from "@/server/catalog-store";
import { findUserById, findUserByLogin, isLive, membershipsOf } from "@/server/directory";
import { createPass } from "@/server/operations";
import { createPerson, createResidentMembership, deleteMembership, listMemberships, listUsers } from "@/server/people-store";
import { hashPassword } from "@/server/password";
import { can, objectsInScope, unitFor, unitInScope, type StaffActor } from "@/server/rbac/decide";
import type { Role } from "@/types/domain";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const householdRoles = new Set<Role>(["RESIDENT", "FAMILY_MEMBER", "GUEST"]);
const roleLabel: Record<string, string> = { RESIDENT: "Житель", FAMILY_MEMBER: "Семья", GUEST: "Гость" };

export type ResidentRow = {
  membershipId: string;
  name: string;
  login: string;
  objectId: string;
  unitId: string;
  unitName: string;
  place: string;
  unitNumber: string;
  roleLabel: string;
};

export type ResidentUnitChoice = {
  id: string;
  name: string;
};

export type ResidentGroup = {
  label: string | null;
  units: ResidentUnitChoice[];
};

export type ResidentObjectChoices = {
  id: string;
  groups: ResidentGroup[];
};

const loginPattern = /^[a-z0-9._-]{3,32}$/;

function cleanName(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите имя" };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, status: 400, message: "Введите имя" };
  if (name.length > 80) return { ok: false, status: 400, message: "Слишком длинное имя" };
  return name;
}

function cleanLogin(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Введите логин" };
  const login = value.trim().toLowerCase();
  if (!loginPattern.test(login)) {
    return { ok: false, status: 400, message: "Логин: от 3 символов, латиница, цифры, точка, _ или -" };
  }
  return login;
}

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };

export function residentBoard(actor: StaffActor): { people: ResidentRow[]; objects: ResidentObjectChoices[]; can: { create: boolean; remove: boolean } } {
  const objects = objectsInScope(actor);
  const users = new Map(listUsers().map((user) => [user.id, user]));
  const people = listMemberships()
    .filter(isLive)
    .filter((membership) => householdRoles.has(membership.role) && membership.objectId && membership.unitId)
    .flatMap((membership) => {
      if (!membership.objectId || !membership.unitId) return [];
      if (membership.companyId !== actor.companyId) return [];
      const user = users.get(membership.userId);
      const unit = findUnit(membership.unitId);
      if (!user || !unit || unit.objectId !== membership.objectId || !unitInScope(actor, unit)) return [];
      const building = unit.buildingId ? findBuilding(unit.buildingId) : undefined;
      return [
        {
          membershipId: membership.id,
          name: user.name,
          login: user.login,
          objectId: membership.objectId,
          unitId: unit.id,
          unitName: unit.name,
          place: building ? `${building.name} · ${unit.name}` : unit.name,
          unitNumber: unit.number,
          roleLabel: roleLabel[membership.role] ?? "Житель",
        },
      ];
    });
  return {
    people,
    objects: objects.map((object) => ({
      id: object.id,
      groups: groupsFor(actor, object.id),
    })),
    can: { create: can(actor, "residents.create"), remove: can(actor, "residents.delete") },
  };
}

function groupsFor(actor: StaffActor, objectId: string): ResidentGroup[] {
  const tree = readTree(objectId);
  if (!tree) return [];
  if (tree.units) return [{ label: null, units: tree.units.map((unit) => ({ id: unit.id, name: unit.name })) }];
  return (tree.buildings ?? [])
    .filter((building) => !actor.scope.buildingId || building.id === actor.scope.buildingId)
    .map((building) => ({
      label: building.name,
      units: building.units.map((unit) => ({ id: unit.id, name: unit.name })),
    }));
}

export function addResident(
  actor: StaffActor,
  input: { objectId: unknown; unitId: unknown; name: unknown; login: unknown; password: unknown; role?: unknown; expiresAt?: unknown },
): Success<{ membershipId: string; existed: boolean }> | Failure {
  if (!can(actor, "residents.create")) return denied;
  if (typeof input.objectId !== "string" || typeof input.unitId !== "string") {
    return { ok: false, status: 400, message: "Выберите объект и единицу" };
  }
  const found = unitFor(actor, input.unitId);
  if (!found.ok) return found;
  const unit = found.value;
  if (unit.objectId !== input.objectId) return { ok: false, status: 400, message: "Выберите единицу этого объекта" };
  const role = typeof input.role === "string" && householdRoles.has(input.role as Role) ? (input.role as Role) : "RESIDENT";
  let expiresAt: string | null = null;
  if (role === "GUEST") {
    if (typeof input.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) {
      return { ok: false, status: 400, message: "Укажите срок пропуска" };
    }
    expiresAt = `${input.expiresAt}T23:59:59`;
  }
  const login = cleanLogin(input.login);
  if (typeof login !== "string") return login;
  const existing = findUserByLogin(login);
  const name = existing ? existing.name : cleanName(input.name);
  if (typeof name !== "string") return name;
  if (
    existing &&
    listMemberships().filter(isLive).some(
      (membership) =>
        membership.userId === existing.id && householdRoles.has(membership.role) && membership.unitId === unit.id,
    )
  ) {
    return { ok: false, status: 409, message: "Этот человек уже закреплён за этой единицей." };
  }
  let userId = existing?.id;
  if (!userId) {
    const password = typeof input.password === "string" ? input.password : "";
    if (password.length < 6 || password.length > 72) {
      return { ok: false, status: 400, message: "Пароль: от 6 до 72 символов" };
    }
    userId = createPerson({ login, name, passwordHash: hashPassword(password) }).id;
  } else if (!membershipsOf(userId).some((membership) => membership.companyId === actor.companyId)) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  const pass =
    role === "GUEST"
      ? createPass(
          { userId: actor.userId, companyId: actor.companyId, objectId: unit.objectId, unitId: unit.id, role: actor.role },
          name,
          `До ${input.expiresAt}`,
        )
      : null;
  const membership = createResidentMembership({
    userId,
    companyId: actor.companyId,
    objectId: unit.objectId,
    unitId: unit.id,
    role,
    expiresAt,
    passId: pass?.id ?? null,
  });
  return { ok: true, value: { membershipId: membership.id, existed: Boolean(existing) } };
}

export function removeResident(actor: StaffActor, membershipId: string): Success<{ id: string }> | Failure {
  if (!can(actor, "residents.delete")) return denied;
  const membership = listMemberships().filter(isLive).find((item) => item.id === membershipId);
  if (!membership || !householdRoles.has(membership.role) || !membership.objectId || membership.companyId !== actor.companyId) {
    return { ok: false, status: 404, message: "Житель не найден" };
  }
  const unit = unitFor(actor, membership.unitId);
  if (!unit.ok) return unit.status === 404 ? { ok: false, status: 404, message: "Житель не найден" } : unit;
  const user = findUserById(membership.userId);
  if (!user) return { ok: false, status: 404, message: "Житель не найден" };
  deleteMembership(membershipId);
  return { ok: true, value: { id: membershipId } };
}
