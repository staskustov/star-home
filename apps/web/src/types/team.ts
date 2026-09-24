import type { Role } from "@/types/domain";

export type TeamMember = {
  membershipId: string;
  userId: string;
  name: string;
  login: string;
  email: string;
  phone: string;
  role: Role;
  roleLabel: string;
  objectId: string | null;
  buildingId: string | null;
  placeKey: string;
  place: string;
  status: "ACTIVE" | "BLOCKED";
  lastLoginAt: string | null;
  lastLogin: string;
  self: boolean;
  manageable: boolean;
};

export type TeamBoard = {
  members: TeamMember[];
  roles: { value: Role; label: string; companyWide: boolean; perObject: boolean; perBuilding: boolean }[];
  places: { key: string; objectId: string | null; buildingId: string | null; label: string }[];
  can: { create: boolean; edit: boolean; assign: boolean; scope: boolean; block: boolean; remove: boolean };
};
