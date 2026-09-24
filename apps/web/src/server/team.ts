import { objectPresentation } from "@/lib/object-presentation";
import { buildingsOf, findBuilding, findObject } from "@/server/catalog-store";
import { findUserByLogin, isLive } from "@/server/directory";
import { recordAudit } from "@/server/operations";
import { hashPassword } from "@/server/password";
import {
  createPerson,
  createStaffMembership,
  endSessions,
  listMemberships,
  listUsers,
  updateMembership,
  updateUser,
  type StoredUser,
} from "@/server/people-store";
import { can, companyWide, objectsInScope, type StaffActor } from "@/server/rbac/decide";
import { canManageRole, roleLabels, roleScopes, staffRoles } from "@/server/rbac/policy";
import type { Membership, Role } from "@/types/domain";
import type { TeamBoard } from "@/types/team";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const loginPattern = /^[a-z0-9._-]{3,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const companyPlace = "Вся компания";

function fail(status: number, message: string): Failure {
  return { ok: false, status, message };
}

function isStaff(membership: Membership): boolean {
  return staffRoles.includes(membership.role) && !membership.unitId;
}

type Place = { objectId: string | null; buildingId: string | null };

function placeLabel(place: Place): string {
  if (!place.objectId) return companyPlace;
  const object = findObject(place.objectId)?.name ?? "Объект";
  const building = place.buildingId ? findBuilding(place.buildingId)?.name : null;
  return building ? `${object} · ${building}` : object;
}

function placeKey(place: Place): string {
  if (!place.objectId) return "company";
  return place.buildingId ? `${place.objectId}/${place.buildingId}` : place.objectId;
}

function placeOf(membership: Membership): Place {
  return { objectId: membership.objectId, buildingId: membership.buildingId ?? null };
}

function assignableRoles(actor: StaffActor): Role[] {
  return staffRoles.filter((role) => canManageRole(actor.role, role));
}

function visible(actor: StaffActor, membership: Membership): boolean {
  if (membership.companyId !== actor.companyId || !isStaff(membership) || !isLive(membership)) return false;
  if (companyWide(actor)) return true;
  if (membership.objectId !== actor.scope.objectId) return false;
  return !actor.scope.buildingId || membership.buildingId === actor.scope.buildingId;
}

function manageable(actor: StaffActor, membership: Membership): boolean {
  return visible(actor, membership) && membership.userId !== actor.userId && canManageRole(actor.role, membership.role);
}

function activeCompanyAdmins(companyId: string, users: Map<string, StoredUser>): Membership[] {
  return listMemberships().filter(
    (membership) =>
      isLive(membership) &&
      membership.companyId === companyId &&
      membership.role === "COMPANY_ADMIN" &&
      users.get(membership.userId)?.status !== "BLOCKED",
  );
}

function userMap(): Map<string, StoredUser> {
  return new Map(listUsers().map((user) => [user.id, user]));
}

function findTarget(actor: StaffActor, membershipId: unknown): Success<{ membership: Membership; user: StoredUser }> | Failure {
  if (typeof membershipId !== "string" || !membershipId) return fail(400, "Сотрудник не найден");
  const membership = listMemberships().find((item) => item.id === membershipId);
  if (!membership || membership.companyId !== actor.companyId || !isStaff(membership) || !isLive(membership)) {
    return fail(404, "Сотрудник не найден");
  }
  if (!visible(actor, membership)) return fail(403, "Нет доступа");
  if (membership.userId === actor.userId) return fail(403, "Свою роль и доступ меняет другой администратор");
  if (!canManageRole(actor.role, membership.role)) return fail(403, "Нет доступа");
  const user = userMap().get(membership.userId);
  if (!user) return fail(404, "Сотрудник не найден");
  return { ok: true, value: { membership, user } };
}

function empty(value: unknown): boolean {
  return value === null || value === "" || value === undefined;
}

function placeFor(actor: StaffActor, role: Role, objectId: unknown, buildingId: unknown): Success<Place> | Failure {
  const scopes = roleScopes[role];
  if (empty(objectId)) {
    if (!empty(buildingId)) return fail(400, "Выберите объект");
    if (!scopes.includes("COMPANY") && !scopes.includes("PLATFORM")) return fail(400, "Для этой роли выберите объект");
    if (!companyWide(actor)) return fail(403, "Доступ ко всей компании выдаёт администратор компании");
    return { ok: true, value: { objectId: null, buildingId: null } };
  }
  if (typeof objectId !== "string") return fail(400, "Выберите объект");
  const object = findObject(objectId);
  if (!object || object.companyId !== actor.companyId) return fail(404, "Объект не найден");
  if (!objectsInScope(actor).some((item) => item.id === object.id)) return fail(403, "Нет доступа к этому объекту");
  if (empty(buildingId)) {
    if (!scopes.includes("OBJECT")) return fail(400, scopes.includes("BUILDING") ? "Выберите корпус" : "Эта роль действует на всю компанию");
    if (actor.scope.buildingId) return fail(403, "Доступ ко всему объекту выдаёт администратор объекта");
    return { ok: true, value: { objectId: object.id, buildingId: null } };
  }
  if (typeof buildingId !== "string") return fail(400, "Выберите корпус");
  if (!scopes.includes("BUILDING")) return fail(400, "Эта роль действует на весь объект");
  const building = findBuilding(buildingId);
  if (!building || building.objectId !== object.id) return fail(404, "Корпус не найден");
  if (actor.scope.buildingId && actor.scope.buildingId !== building.id) return fail(403, "Нет доступа к этому корпусу");
  return { ok: true, value: { objectId: object.id, buildingId: building.id } };
}

function cleanRole(actor: StaffActor, value: unknown): Success<Role> | Failure {
  if (typeof value !== "string" || !staffRoles.includes(value as Role)) return fail(400, "Выберите роль");
  const role = value as Role;
  if (!assignableRoles(actor).includes(role)) return fail(403, "Эту роль вы назначить не можете");
  return { ok: true, value: role };
}

function cleanName(value: unknown): Success<string> | Failure {
  if (typeof value !== "string") return fail(400, "Введите имя");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return fail(400, "Введите имя");
  if (name.length > 80) return fail(400, "Слишком длинное имя");
  return { ok: true, value: name };
}

function cleanEmail(value: unknown): Success<string> | Failure {
  if (value === undefined || value === null || value === "") return { ok: true, value: "" };
  if (typeof value !== "string") return fail(400, "Проверьте email");
  const email = value.trim().toLowerCase();
  if (email.length > 120 || !emailPattern.test(email)) return fail(400, "Проверьте email");
  return { ok: true, value: email };
}

function cleanPhone(value: unknown): Success<string> | Failure {
  if (value === undefined || value === null || value === "") return { ok: true, value: "" };
  if (typeof value !== "string") return fail(400, "Проверьте телефон");
  const phone = value.trim().replace(/[^\d+()\- ]/g, "");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return fail(400, "Проверьте телефон");
  return { ok: true, value: phone };
}

function audit(actor: StaffActor, action: string, place: Place, membershipId: string, target: string): void {
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: place.objectId,
    buildingId: place.buildingId,
    action,
    targetType: "membership",
    targetId: membershipId,
    target,
  });
}

function loginLabel(at: string | null): string {
  if (!at) return "Ещё не входил";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "Ещё не входил";
  const day = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function describe(user: StoredUser, role: Role, place: Place): string {
  return `${user.name} · ${roleLabels[role]} · ${placeLabel(place)}`;
}

export function teamBoard(actor: StaffActor): TeamBoard {
  const users = userMap();
  const members = listMemberships()
    .filter((membership) => visible(actor, membership))
    .flatMap((membership) => {
      const user = users.get(membership.userId);
      if (!user) return [];
      return [
        {
          membershipId: membership.id,
          userId: user.id,
          name: user.name,
          login: user.login,
          email: user.email ?? "",
          phone: user.phone ?? "",
          role: membership.role,
          roleLabel: roleLabels[membership.role],
          objectId: membership.objectId,
          buildingId: membership.buildingId ?? null,
          placeKey: placeKey(placeOf(membership)),
          place: placeLabel(placeOf(membership)),
          status: user.status ?? "ACTIVE",
          lastLoginAt: user.lastLoginAt ?? null,
          lastLogin: loginLabel(user.lastLoginAt ?? null),
          self: user.id === actor.userId,
          manageable: manageable(actor, membership),
        },
      ];
    })
    .sort((left, right) => Number(right.self) - Number(left.self) || left.name.localeCompare(right.name, "ru"));
  const places = [
    ...(companyWide(actor) ? [{ objectId: null, buildingId: null }] : []),
    ...objectsInScope(actor).flatMap((object) => [
      ...(actor.scope.buildingId ? [] : [{ objectId: object.id, buildingId: null }]),
      ...(objectPresentation[object.type].usesBuildings
        ? buildingsOf(object.id)
            .filter((building) => !actor.scope.buildingId || building.id === actor.scope.buildingId)
            .map((building) => ({ objectId: object.id, buildingId: building.id }))
        : []),
    ]),
  ].map((place) => ({ ...place, key: placeKey(place), label: placeLabel(place) }));
  return {
    members,
    roles: assignableRoles(actor).map((role) => ({
      value: role,
      label: roleLabels[role],
      companyWide: roleScopes[role].includes("COMPANY") || roleScopes[role].includes("PLATFORM"),
      perObject: roleScopes[role].includes("OBJECT"),
      perBuilding: roleScopes[role].includes("BUILDING"),
    })),
    places,
    can: {
      create: can(actor, "users.create") && can(actor, "users.role.assign") && can(actor, "users.scope.assign"),
      edit: can(actor, "users.edit"),
      assign: can(actor, "users.role.assign"),
      scope: can(actor, "users.scope.assign"),
      block: can(actor, "users.block"),
      remove: can(actor, "users.delete"),
    },
  };
}

export function addMember(
  actor: StaffActor,
  input: { name?: unknown; login?: unknown; email?: unknown; phone?: unknown; password?: unknown; role?: unknown; objectId?: unknown; buildingId?: unknown },
): Success<{ membershipId: string; existed: boolean }> | Failure {
  if (!can(actor, "users.create") || !can(actor, "users.role.assign") || !can(actor, "users.scope.assign")) return fail(403, "Нет доступа");
  const role = cleanRole(actor, input.role);
  if (!role.ok) return role;
  const place = placeFor(actor, role.value, input.objectId, input.buildingId);
  if (!place.ok) return place;
  if (typeof input.login !== "string" || !loginPattern.test(input.login.trim().toLowerCase())) {
    return fail(400, "Логин: от 3 символов, латиница, цифры, точка, _ или -");
  }
  const login = input.login.trim().toLowerCase();
  const email = cleanEmail(input.email);
  if (!email.ok) return email;
  const phone = cleanPhone(input.phone);
  if (!phone.ok) return phone;
  const existing = findUserByLogin(login);
  let user: StoredUser;
  if (existing) {
    const ours = listMemberships().some((membership) => isLive(membership) && membership.userId === existing.id && membership.companyId === actor.companyId);
    if (!ours) return fail(409, "Этот логин уже занят");
    const duplicate = listMemberships().some(
      (membership) => isLive(membership) && membership.userId === existing.id && isStaff(membership) && placeKey(placeOf(membership)) === placeKey(place.value),
    );
    if (duplicate) return fail(409, "У этого человека уже есть роль здесь");
    user = existing;
  } else {
    const name = cleanName(input.name);
    if (!name.ok) return name;
    const password = typeof input.password === "string" ? input.password : "";
    if (password.length < 8 || password.length > 72) return fail(400, "Пароль: от 8 до 72 символов");
    user = createPerson({ login, name: name.value, passwordHash: hashPassword(password), email: email.value, phone: phone.value });
  }
  const membership = createStaffMembership({
    userId: user.id,
    companyId: actor.companyId,
    role: role.value,
    objectId: place.value.objectId,
    buildingId: place.value.buildingId,
    createdBy: actor.userId,
  });
  audit(actor, "TEAM_ADD", place.value, membership.id, describe(user, role.value, place.value));
  return { ok: true, value: { membershipId: membership.id, existed: Boolean(existing) } };
}

export function editMember(actor: StaffActor, input: { membershipId?: unknown; name?: unknown; email?: unknown; phone?: unknown }): Success<{ id: string }> | Failure {
  if (!can(actor, "users.edit")) return fail(403, "Нет доступа");
  const target = findTarget(actor, input.membershipId);
  if (!target.ok) return target;
  const name = cleanName(input.name);
  if (!name.ok) return name;
  const email = cleanEmail(input.email);
  if (!email.ok) return email;
  const phone = cleanPhone(input.phone);
  if (!phone.ok) return phone;
  updateUser(target.value.user.id, { name: name.value, email: email.value, phone: phone.value });
  audit(actor, "TEAM_EDIT", placeOf(target.value.membership), target.value.membership.id, name.value);
  return { ok: true, value: { id: target.value.membership.id } };
}

export function changeAccess(
  actor: StaffActor,
  input: { membershipId?: unknown; role?: unknown; objectId?: unknown; buildingId?: unknown },
): Success<{ id: string }> | Failure {
  const target = findTarget(actor, input.membershipId);
  if (!target.ok) return target;
  const { membership, user } = target.value;
  const role = cleanRole(actor, input.role);
  if (!role.ok) return role;
  const place = placeFor(actor, role.value, input.objectId, input.buildingId);
  if (!place.ok) return place;
  const roleChanged = role.value !== membership.role;
  const placeChanged = placeKey(place.value) !== placeKey(placeOf(membership));
  if (!roleChanged && !placeChanged) return { ok: true, value: { id: membership.id } };
  if (roleChanged && !can(actor, "users.role.assign")) return fail(403, "Нет доступа");
  if (placeChanged && !can(actor, "users.scope.assign")) return fail(403, "Нет доступа");
  if (membership.role === "COMPANY_ADMIN" && role.value !== "COMPANY_ADMIN" && activeCompanyAdmins(actor.companyId, userMap()).length <= 1) {
    return fail(409, "В компании должен остаться хотя бы один администратор");
  }
  const before = describe(user, membership.role, placeOf(membership));
  updateMembership(membership.id, { role: role.value, objectId: place.value.objectId, buildingId: place.value.buildingId });
  endSessions(user.id);
  audit(actor, roleChanged ? "TEAM_ROLE" : "TEAM_SCOPE", place.value, membership.id, `${before} → ${roleLabels[role.value]} · ${placeLabel(place.value)}`);
  return { ok: true, value: { id: membership.id } };
}

export function setMemberBlocked(actor: StaffActor, input: { membershipId?: unknown }, blocked: boolean): Success<{ id: string }> | Failure {
  if (!can(actor, "users.block")) return fail(403, "Нет доступа");
  const target = findTarget(actor, input.membershipId);
  if (!target.ok) return target;
  const { membership, user } = target.value;
  const others = listMemberships().filter((item) => isLive(item) && item.userId === user.id && item.id !== membership.id);
  if (others.some((item) => item.companyId !== actor.companyId || (isStaff(item) && !manageable(actor, item)))) {
    return fail(403, "У этого человека есть доступ, которым вы не управляете");
  }
  if (blocked && membership.role === "COMPANY_ADMIN" && activeCompanyAdmins(actor.companyId, userMap()).length <= 1) {
    return fail(409, "В компании должен остаться хотя бы один администратор");
  }
  updateUser(user.id, { status: blocked ? "BLOCKED" : "ACTIVE" });
  if (blocked) endSessions(user.id);
  audit(actor, blocked ? "TEAM_BLOCK" : "TEAM_RESTORE", placeOf(membership), membership.id, describe(user, membership.role, placeOf(membership)));
  return { ok: true, value: { id: membership.id } };
}

export function removeMember(actor: StaffActor, input: { membershipId?: unknown }): Success<{ id: string }> | Failure {
  if (!can(actor, "users.delete")) return fail(403, "Нет доступа");
  const target = findTarget(actor, input.membershipId);
  if (!target.ok) return target;
  const { membership, user } = target.value;
  if (membership.role === "COMPANY_ADMIN" && activeCompanyAdmins(actor.companyId, userMap()).length <= 1) {
    return fail(409, "В компании должен остаться хотя бы один администратор");
  }
  updateMembership(membership.id, { status: "REVOKED", revokedAt: new Date().toISOString(), revokedBy: actor.userId });
  endSessions(user.id);
  audit(actor, "TEAM_REMOVE", placeOf(membership), membership.id, describe(user, membership.role, placeOf(membership)));
  return { ok: true, value: { id: membership.id } };
}
