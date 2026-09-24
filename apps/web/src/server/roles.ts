import { companyGrants, setCompanyGrants } from "@/server/catalog-store";
import { recordAudit } from "@/server/operations";
import { can, grantedTo, type StaffActor } from "@/server/rbac/decide";
import { isPermission, permissionGroups, permissions, type Permission } from "@/server/rbac/permissions";
import { canEditRole, lockedOf, permissionsOf, roleLabels, staffRoles } from "@/server/rbac/policy";
import type { Role } from "@/types/domain";
import type { RolesBoard } from "@/types/roles";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };

const order: Role[] = [
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
];

function sorted(set: ReadonlySet<Permission>): Permission[] {
  return permissions.filter((permission) => set.has(permission));
}

function editable(actor: StaffActor, role: Role): boolean {
  return can(actor, "roles.edit") && canEditRole(actor.role, role);
}

export function rolesBoard(actor: StaffActor): RolesBoard {
  return {
    groups: permissionGroups,
    canEdit: can(actor, "roles.edit"),
    roles: order
      .filter((role) => role !== "SUPER_ADMIN" || actor.role === "SUPER_ADMIN")
      .map((role) => ({
        value: role,
        label: roleLabels[role],
        household: !staffRoles.includes(role),
        editable: editable(actor, role),
        customized: companyGrants(actor.companyId, role) !== null,
        ceiling: sorted(permissionsOf(role)),
        granted: sorted(grantedTo(role, actor.companyId)),
        locked: sorted(lockedOf(role)),
      })),
  };
}

export function saveRole(actor: StaffActor, input: { role?: unknown; permissions?: unknown }): Success<{ role: Role; granted: Permission[] }> | Failure {
  if (!can(actor, "roles.edit")) return { ok: false, status: 403, message: "Нет доступа" };
  if (typeof input.role !== "string" || !order.includes(input.role as Role)) return { ok: false, status: 400, message: "Выберите роль" };
  const role = input.role as Role;
  if (!canEditRole(actor.role, role)) return { ok: false, status: 403, message: "Эту роль вы настроить не можете" };
  if (!Array.isArray(input.permissions) || input.permissions.length > permissions.length) {
    return { ok: false, status: 400, message: "Проверьте список прав" };
  }
  const ceiling = permissionsOf(role);
  const chosen = new Set<Permission>(lockedOf(role));
  for (const value of input.permissions) {
    if (!isPermission(value) || !ceiling.has(value)) return { ok: false, status: 400, message: "Это право недоступно для роли" };
    chosen.add(value);
  }
  const before = grantedTo(role, actor.companyId);
  const added = sorted(chosen).filter((permission) => !before.has(permission));
  const removed = sorted(before).filter((permission) => !chosen.has(permission));
  if (added.some((permission) => !can(actor, permission))) {
    return { ok: false, status: 403, message: "Нельзя выдать право, которого нет у вас" };
  }
  if (added.length === 0 && removed.length === 0) return { ok: true, value: { role, granted: sorted(before) } };
  const standard = chosen.size === ceiling.size;
  setCompanyGrants(actor.companyId, role, standard ? null : sorted(chosen));
  const change = [added.length ? `+${added.length}` : "", removed.length ? `−${removed.length}` : ""].filter(Boolean).join(" ");
  recordAudit({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    objectId: "",
    action: "ROLES_EDIT",
    target: `${roleLabels[role]} · ${standard ? "стандартные права" : `${chosen.size} из ${ceiling.size}`} · ${change}`,
    result: "SUCCESS",
    error: "",
  });
  return { ok: true, value: { role, granted: sorted(chosen) } };
}
