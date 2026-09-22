import { findBuilding, findUnit, objectsOf, readTree } from "@/server/catalog-store";
import { catalogActor } from "@/server/catalog";
import { findUserById, findUserByLogin, membershipsOf } from "@/server/directory";
import { createPerson, createResidentMembership, deleteMembership, listMemberships, listUsers } from "@/server/people-store";
import { hashPassword } from "@/server/password";
import type { Role } from "@/types/domain";

type Actor = {
  companyId: string;
  role: Role;
  objectId: string | null;
};

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const companyRoles = new Set<Role>(["SUPER_ADMIN", "COMPANY_ADMIN"]);

export type ResidentRow = {
  membershipId: string;
  name: string;
  login: string;
  objectId: string;
  unitId: string;
  unitName: string;
  place: string;
  unitNumber: string;
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

function canTouch(actor: Actor, objectId: string): boolean {
  if (companyRoles.has(actor.role)) return true;
  return actor.objectId === objectId;
}

export async function residentsActor(): Promise<Success<Actor> | Failure> {
  const actor = await catalogActor();
  if (!actor.ok) return actor;
  return { ok: true, value: actor.value };
}

export function residentBoard(actor: Actor): { people: ResidentRow[]; objects: ResidentObjectChoices[] } {
  const limit = companyRoles.has(actor.role) ? null : actor.objectId;
  const objects = objectsOf(actor.companyId, limit);
  const users = new Map(listUsers().map((user) => [user.id, user]));
  const people = listMemberships()
    .filter((membership) => membership.role === "RESIDENT" && membership.objectId && membership.unitId)
    .flatMap((membership) => {
      if (!membership.objectId || !membership.unitId) return [];
      if (!objects.some((object) => object.id === membership.objectId)) return [];
      const user = users.get(membership.userId);
      const unit = findUnit(membership.unitId);
      if (!user || !unit) return [];
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
        },
      ];
    });
  return {
    people,
    objects: objects.map((object) => ({
      id: object.id,
      groups: groupsFor(object.id),
    })),
  };
}

function groupsFor(objectId: string): ResidentGroup[] {
  const tree = readTree(objectId);
  if (!tree) return [];
  if (tree.units) return [{ label: null, units: tree.units.map((unit) => ({ id: unit.id, name: unit.name })) }];
  return (tree.buildings ?? []).map((building) => ({
    label: building.name,
    units: building.units.map((unit) => ({ id: unit.id, name: unit.name })),
  }));
}

export function addResident(
  actor: Actor,
  input: { objectId: unknown; unitId: unknown; name: unknown; login: unknown; password: unknown },
): Success<{ membershipId: string; existed: boolean }> | Failure {
  if (typeof input.objectId !== "string" || typeof input.unitId !== "string") {
    return { ok: false, status: 400, message: "Выберите объект и единицу" };
  }
  const unit = findUnit(input.unitId);
  if (!unit || unit.objectId !== input.objectId) {
    return { ok: false, status: 400, message: "Выберите единицу этого объекта" };
  }
  const objectOk = objectsOf(actor.companyId, null).some((object) => object.id === unit.objectId);
  if (!objectOk || !canTouch(actor, unit.objectId)) {
    return { ok: false, status: 403, message: "Нет доступа" };
  }
  const login = cleanLogin(input.login);
  if (typeof login !== "string") return login;
  const existing = findUserByLogin(login);
  const name = existing ? existing.name : cleanName(input.name);
  if (typeof name !== "string") return name;
  if (
    existing &&
    listMemberships().some(
      (membership) =>
        membership.userId === existing.id && membership.role === "RESIDENT" && membership.unitId === unit.id,
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
  const membership = createResidentMembership({
    userId,
    companyId: actor.companyId,
    objectId: unit.objectId,
    unitId: unit.id,
  });
  return { ok: true, value: { membershipId: membership.id, existed: Boolean(existing) } };
}

export function removeResident(actor: Actor, membershipId: string): Success<{ id: string }> | Failure {
  const membership = listMemberships().find((item) => item.id === membershipId);
  if (!membership || membership.role !== "RESIDENT" || !membership.objectId) {
    return { ok: false, status: 404, message: "Житель не найден" };
  }
  const sameCompany = membership.companyId === actor.companyId;
  if (!sameCompany) return { ok: false, status: 404, message: "Житель не найден" };
  if (!canTouch(actor, membership.objectId)) return { ok: false, status: 403, message: "Нет доступа" };
  const user = findUserById(membership.userId);
  if (!user) return { ok: false, status: 404, message: "Житель не найден" };
  deleteMembership(membershipId);
  return { ok: true, value: { id: membershipId } };
}
