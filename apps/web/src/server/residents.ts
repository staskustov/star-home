import { findBuilding, findUnit, readTree } from "@/server/catalog-store";
import { findUserById, findUserByLogin, isLive, membershipsOf } from "@/server/directory";
import { createPass, recordAudit } from "@/server/operations";
import {
  createPerson,
  createResidentMembership,
  deleteMembership,
  endSessions,
  listMemberships,
  listUsers,
  updateMembership,
  updateUser,
} from "@/server/people-store";
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
  role: Role;
  roleLabel: string;
  expiresAt: string;
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

export function residentBoard(actor: StaffActor): {
  people: ResidentRow[];
  objects: ResidentObjectChoices[];
  can: { create: boolean; edit: boolean; remove: boolean };
} {
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
          role: membership.role,
          roleLabel: roleLabel[membership.role] ?? "Житель",
          expiresAt: membership.expiresAt?.slice(0, 10) ?? "",
        },
      ];
    });
  return {
    people,
    objects: objects.map((object) => ({
      id: object.id,
      groups: groupsFor(actor, object.id),
    })),
    can: {
      create: can(actor, "residents.create"),
      edit: can(actor, "residents.edit"),
      remove: can(actor, "residents.delete"),
    },
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
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: unit.objectId,
    buildingId: unit.buildingId,
    unitId: unit.id,
    action: "RESIDENT_ADD",
    targetType: "membership",
    targetId: membership.id,
    target: `${name} · ${roleLabel[role] ?? "Житель"} · ${unit.name}`,
  });
  return { ok: true, value: { membershipId: membership.id, existed: Boolean(existing) } };
}

function guestExpiry(value: unknown, fallback: string | null): string | Failure {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59`;
  if (fallback) return fallback;
  return { ok: false, status: 400, message: "Укажите срок пропуска" };
}

function reachableHousehold(actor: StaffActor, membership: { role: Role; unitId: string | null }): boolean {
  if (!householdRoles.has(membership.role) || !membership.unitId) return false;
  const unit = findUnit(membership.unitId);
  return Boolean(unit) && unitInScope(actor, unit);
}

export function updateResident(
  actor: StaffActor,
  membershipId: string,
  input: { name?: unknown; login?: unknown; password?: unknown; role?: unknown; unitId?: unknown; expiresAt?: unknown },
): Success<{ id: string }> | Failure {
  if (!can(actor, "residents.edit")) return denied;
  const membership = listMemberships().filter(isLive).find((item) => item.id === membershipId);
  if (!membership || !householdRoles.has(membership.role) || !membership.objectId || membership.companyId !== actor.companyId) {
    return { ok: false, status: 404, message: "Житель не найден" };
  }
  const current = unitFor(actor, membership.unitId);
  if (!current.ok) return current.status === 404 ? { ok: false, status: 404, message: "Житель не найден" } : current;
  const user = findUserById(membership.userId);
  if (!user) return { ok: false, status: 404, message: "Житель не найден" };
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const login = cleanLogin(input.login);
  if (typeof login !== "string") return login;
  const taken = findUserByLogin(login);
  if (taken && taken.id !== user.id) return { ok: false, status: 409, message: "Этот логин уже занят" };
  const nextUnit = unitFor(actor, typeof input.unitId === "string" ? input.unitId : membership.unitId);
  if (!nextUnit.ok) return nextUnit;
  const role = typeof input.role === "string" && householdRoles.has(input.role as Role) ? (input.role as Role) : membership.role;
  const expiresAt = role === "GUEST" ? guestExpiry(input.expiresAt, membership.expiresAt ?? null) : null;
  if (expiresAt && typeof expiresAt !== "string") return expiresAt;
  if (
    nextUnit.value.id !== membership.unitId &&
    listMemberships()
      .filter(isLive)
      .some(
        (item) =>
          item.id !== membership.id &&
          item.userId === user.id &&
          householdRoles.has(item.role) &&
          item.unitId === nextUnit.value.id,
      )
  ) {
    return { ok: false, status: 409, message: "Этот человек уже закреплён за этой единицей." };
  }
  const password = typeof input.password === "string" ? input.password : "";
  if (password && (password.length < 6 || password.length > 72)) {
    return { ok: false, status: 400, message: "Пароль: от 6 до 72 символов" };
  }
  const loginChanged = login !== user.login;
  const passwordChanged = Boolean(password);
  if (
    (loginChanged || passwordChanged) &&
    listMemberships()
      .filter(isLive)
      .some((item) => item.userId === user.id && item.id !== membership.id && !reachableHousehold(actor, item))
  ) {
    return { ok: false, status: 403, message: "У этого человека есть доступ, которым вы не управляете" };
  }
  let passId = membership.passId ?? null;
  if (role === "GUEST" && role !== membership.role && !passId) {
    const until = typeof expiresAt === "string" ? expiresAt.slice(0, 10) : "";
    passId =
      createPass(
        { userId: actor.userId, companyId: actor.companyId, objectId: nextUnit.value.objectId, unitId: nextUnit.value.id, role: actor.role },
        name,
        until ? `До ${until}` : "Гость",
      ).id;
  }
  updateUser(user.id, {
    name,
    login,
    ...(passwordChanged ? { passwordHash: hashPassword(password) } : {}),
  });
  updateMembership(membership.id, {
    role,
    objectId: nextUnit.value.objectId,
    unitId: nextUnit.value.id,
    expiresAt: typeof expiresAt === "string" ? expiresAt : null,
    passId,
  });
  if (loginChanged || passwordChanged || nextUnit.value.id !== membership.unitId || role !== membership.role) {
    endSessions(user.id);
  }
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: nextUnit.value.objectId,
    buildingId: nextUnit.value.buildingId,
    unitId: nextUnit.value.id,
    action: "RESIDENT_EDIT",
    targetType: "membership",
    targetId: membership.id,
    target: `${name} · ${roleLabel[role] ?? "Житель"} · ${nextUnit.value.name}`,
  });
  return { ok: true, value: { id: membership.id } };
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
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: unit.value.objectId,
    buildingId: unit.value.buildingId,
    unitId: unit.value.id,
    action: "RESIDENT_REMOVE",
    targetType: "membership",
    targetId: membershipId,
    target: `${user.name} · ${roleLabel[membership.role] ?? "Житель"} · ${unit.value.name}`,
  });
  return { ok: true, value: { id: membershipId } };
}
