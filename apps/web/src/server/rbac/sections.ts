import { objectPresentation } from "@/lib/object-presentation";
import { structureCounts } from "@/server/catalog-store";
import { can, objectsInScope, type StaffActor } from "@/server/rbac/decide";
import type { Permission } from "@/server/rbac/permissions";
import type { AdminObjectSnapshot, NavGroup, NavItem } from "@/types/domain";

const sections: { group: string; permission: Permission; item: NavItem }[] = [
  { group: "Объект", permission: "dashboard.view", item: { href: "/admin", label: "Обзор", icon: "overview" } },
  { group: "Объект", permission: "objects.view", item: { href: "/admin/objects", label: "Объекты", icon: "objects" } },
  { group: "Объект", permission: "residents.view", item: { href: "/admin/residents", label: "Жители", icon: "residents" } },
  { group: "Операции", permission: "access.view", item: { href: "/admin/access", label: "Доступ", icon: "access" } },
  { group: "Операции", permission: "security.view", item: { href: "/admin/security", label: "Охрана", icon: "security" } },
  { group: "Операции", permission: "service.view", item: { href: "/admin/requests", label: "Заявки", icon: "requests" } },
  { group: "Операции", permission: "payments.view", item: { href: "/admin/payments", label: "Платежи", icon: "payments" } },
  { group: "Системы", permission: "devices.view", item: { href: "/admin/devices", label: "Устройства", icon: "devices" } },
  { group: "Системы", permission: "ai.view", item: { href: "/admin/ai", label: "AI", icon: "ai" } },
  { group: "Управление", permission: "users.view", item: { href: "/admin/team", label: "Команда", icon: "team" } },
  { group: "Управление", permission: "settings.view", item: { href: "/admin/settings", label: "Настройки", icon: "settings" } },
];

function placeLabel(actor: StaffActor): string {
  const types = new Set(objectsInScope(actor).map((object) => object.type));
  const [only] = types;
  return types.size === 1 && only ? objectPresentation[only].placeLabel : "Объекты";
}

export function sectionsFor(actor: StaffActor): NavGroup[] {
  const place = placeLabel(actor);
  const groups: NavGroup[] = [];
  for (const section of sections) {
    if (!can(actor, section.permission)) continue;
    const item = section.item.href === "/admin/objects" ? { ...section.item, label: place } : section.item;
    const group = groups.find((entry) => entry.label === section.group);
    if (group) group.items.push(item);
    else groups.push({ label: section.group, items: [item] });
  }
  return groups;
}

export function adminObjectsFor(actor: StaffActor): AdminObjectSnapshot[] {
  return objectsInScope(actor).map((object) => {
    const counts = structureCounts(object.id, object.type);
    return { id: object.id, companyId: object.companyId, name: object.name, type: object.type, buildings: counts.buildings, units: counts.units };
  });
}
