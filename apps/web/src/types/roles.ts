import type { Permission } from "@/server/rbac/permissions";
import type { Role } from "@/types/domain";

export type RoleColumn = {
  value: Role;
  label: string;
  household: boolean;
  editable: boolean;
  customized: boolean;
  ceiling: Permission[];
  granted: Permission[];
  locked: Permission[];
};

export type RolesBoard = {
  groups: { id: string; label: string; items: { id: Permission; label: string }[] }[];
  roles: RoleColumn[];
  canEdit: boolean;
};
