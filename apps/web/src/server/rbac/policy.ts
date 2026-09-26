import type { AuditCategory } from "@/server/audit-actions";
import { permissions, type Permission } from "@/server/rbac/permissions";
import type { Role } from "@/types/domain";

export type ScopeKind = "PLATFORM" | "COMPANY" | "OBJECT" | "BUILDING" | "UNIT";

const householdOnly = new Set<Permission>(["payments.pay", "home.view", "home.mode.switch", "home.family.manage", "guest.pass.view"]);

const staffAll = permissions.filter((permission) => !householdOnly.has(permission));

const objectAdminDenied = new Set<Permission>([
  "objects.create",
  "objects.delete",
  "payments.refund",
  "ai.manage",
  "users.delete",
  "roles.edit",
  "audit.export",
  "settings.company.edit",
]);

const grants: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: staffAll,
  COMPANY_ADMIN: staffAll,
  OBJECT_ADMIN: staffAll.filter((permission) => !objectAdminDenied.has(permission)),
  MANAGER: [
    "dashboard.view",
    "objects.view",
    "objects.structure.edit",
    "residents.view",
    "residents.create",
    "residents.edit",
    "access.view",
    "access.pass.create",
    "access.pass.revoke",
    "access.gate.open",
    "security.view",
    "security.alarm.raise",
    "security.alarm.handle",
    "security.camera.view",
    "service.view",
    "service.create",
    "service.edit",
    "payments.view",
    "devices.view",
    "devices.command",
    "devices.edit",
    "engineering.view",
    "engineering.command",
    "ai.use",
    "settings.view",
  ],
  SECURITY: [
    "dashboard.view",
    "objects.view",
    "residents.view",
    "access.view",
    "access.pass.create",
    "access.pass.revoke",
    "access.gate.open",
    "security.view",
    "security.alarm.raise",
    "security.alarm.handle",
    "security.camera.view",
    "devices.view",
    "audit.view",
  ],
  SERVICE_OPERATOR: ["dashboard.view", "objects.view", "residents.view", "service.view", "service.create", "service.edit", "devices.view", "engineering.view"],
  ACCOUNTANT: ["dashboard.view", "objects.view", "residents.view", "payments.view", "payments.invoice.create", "payments.invoice.edit", "payments.export"],
  RESIDENT: [
    "access.view",
    "access.pass.create",
    "access.pass.revoke",
    "access.gate.open",
    "security.alarm.raise",
    "security.camera.view",
    "service.view",
    "service.create",
    "payments.view",
    "payments.pay",
    "devices.view",
    "devices.command",
    "ai.use",
    "home.view",
    "home.mode.switch",
    "home.family.manage",
  ],
  FAMILY_MEMBER: [
    "access.view",
    "access.gate.open",
    "security.alarm.raise",
    "security.camera.view",
    "service.view",
    "service.create",
    "devices.view",
    "devices.command",
    "ai.use",
    "home.view",
    "home.mode.switch",
  ],
  GUEST: ["access.view", "guest.pass.view"],
};

const selfOnly: Partial<Record<Role, readonly Permission[]>> = {
  FAMILY_MEMBER: ["service.view"],
  GUEST: ["access.view"],
};

export const roleRank: Record<Role, number> = {
  SUPER_ADMIN: 100,
  COMPANY_ADMIN: 90,
  OBJECT_ADMIN: 70,
  MANAGER: 50,
  SECURITY: 40,
  SERVICE_OPERATOR: 40,
  ACCOUNTANT: 40,
  RESIDENT: 10,
  FAMILY_MEMBER: 5,
  GUEST: 1,
};

export const roleScopes: Record<Role, readonly ScopeKind[]> = {
  SUPER_ADMIN: ["PLATFORM"],
  COMPANY_ADMIN: ["COMPANY"],
  OBJECT_ADMIN: ["OBJECT"],
  MANAGER: ["OBJECT", "BUILDING"],
  SECURITY: ["OBJECT", "BUILDING"],
  SERVICE_OPERATOR: ["OBJECT", "BUILDING"],
  ACCOUNTANT: ["COMPANY", "OBJECT"],
  RESIDENT: ["UNIT"],
  FAMILY_MEMBER: ["UNIT"],
  GUEST: ["UNIT"],
};

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Администратор платформы",
  COMPANY_ADMIN: "Администратор компании",
  OBJECT_ADMIN: "Администратор объекта",
  MANAGER: "Управляющий",
  SECURITY: "Охрана",
  SERVICE_OPERATOR: "Оператор сервиса",
  ACCOUNTANT: "Бухгалтер",
  RESIDENT: "Житель",
  FAMILY_MEMBER: "Семья",
  GUEST: "Гость",
};

export const staffRoles: readonly Role[] = ["SUPER_ADMIN", "COMPANY_ADMIN", "OBJECT_ADMIN", "MANAGER", "SECURITY", "SERVICE_OPERATOR", "ACCOUNTANT"];

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "SUPER_ADMIN") return true;
  if (targetRole === "SUPER_ADMIN") return false;
  if (actorRole === "COMPANY_ADMIN") return roleRank[targetRole] <= roleRank.COMPANY_ADMIN;
  return roleRank[targetRole] < roleRank[actorRole];
}

export function permissionsOf(role: Role): ReadonlySet<Permission> {
  return new Set(grants[role]);
}

export function householdCan(role: Role, permission: Permission): boolean {
  return !staffRoles.includes(role) && grants[role].includes(permission);
}

export function lockedOf(role: Role): ReadonlySet<Permission> {
  if (role === "SUPER_ADMIN" || role === "COMPANY_ADMIN") {
    return new Set<Permission>(["dashboard.view", "objects.view", "objects.edit", "objects.delete"]);
  }
  return new Set<Permission>(staffRoles.includes(role) ? ["dashboard.view"] : []);
}

export function canEditRole(actorRole: Role, targetRole: Role): boolean {
  if (!staffRoles.includes(targetRole) || targetRole === "SUPER_ADMIN") return false;
  if (actorRole === "SUPER_ADMIN") return true;
  return roleRank[targetRole] < roleRank[actorRole];
}

export function selfOnlyOf(role: Role): ReadonlySet<Permission> {
  return new Set(selfOnly[role] ?? []);
}

const auditCategoryScope: Partial<Record<Role, readonly AuditCategory[]>> = {
  SECURITY: ["ACCESS", "SECURITY"],
};

export function auditCategoriesOf(role: Role): ReadonlySet<AuditCategory> | null {
  const categories = auditCategoryScope[role];
  return categories ? new Set(categories) : null;
}
