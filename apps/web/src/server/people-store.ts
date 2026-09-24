import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { boundValue, remember } from "@/server/store-bind";
import type { Membership } from "@/types/domain";

export type UserStatus = "ACTIVE" | "BLOCKED";

export type StoredUser = {
  id: string;
  login: string;
  name: string;
  passwordHash: string;
  email?: string;
  phone?: string;
  status?: UserStatus;
  lastLoginAt?: string | null;
  sessionVersion?: number;
};

type PeopleFile = {
  users: StoredUser[];
  memberships: Membership[];
  staffSeed?: number;
};

const staffSeedVersion = 3;

const demoStaff: { user: StoredUser; membership: Membership }[] = [
  {
    user: {
      id: "usr_object",
      login: "object",
      name: "Ольга Соколова",
      passwordHash: "1caxM7VkG9ibtZ6Pbd7wiw._Nx2jdUF5cGujF3WEakOuhUo93mhfHhLPEhBnhPFEP4",
    },
    membership: { id: "mem_object_siyanie", userId: "usr_object", companyId: "cmp_star", role: "OBJECT_ADMIN", objectId: "obj_siyanie", unitId: null },
  },
  {
    user: {
      id: "usr_manager",
      login: "manager",
      name: "Андрей Ким",
      passwordHash: "x2UF9UugV-KjhHFLS3CSqA.SBymB-gaSzviH_fI5jHRqtfZ1Ar7i79jyc2XTm7DAFU",
    },
    membership: { id: "mem_manager_siyanie", userId: "usr_manager", companyId: "cmp_star", role: "MANAGER", objectId: "obj_siyanie", unitId: null },
  },
  {
    user: {
      id: "usr_security",
      login: "security",
      name: "Игорь Волков",
      passwordHash: "ZJJ7ELQuVTts1SS4fXtJog.Wz3cro80NqvCQL5opbLatmRyWHiC_QfyVYvPitRL2OA",
    },
    membership: { id: "mem_security_siyanie", userId: "usr_security", companyId: "cmp_star", role: "SECURITY", objectId: "obj_siyanie", unitId: null },
  },
  {
    user: {
      id: "usr_service",
      login: "service",
      name: "Елена Морозова",
      passwordHash: "VbtTIojGRCD-vT2pFNpEAg.0l6x7Kvwtlk9OPgaSDffR12_7nIvgH5-URY2P3DKnTE",
    },
    membership: { id: "mem_service_siyanie", userId: "usr_service", companyId: "cmp_star", role: "SERVICE_OPERATOR", objectId: "obj_siyanie", unitId: null },
  },
  {
    user: {
      id: "usr_accountant",
      login: "accountant",
      name: "Наталья Белова",
      passwordHash: "Q8OmgkWpLXmHIiedhw0Eag.oGT2whjitwYIzbDGtF53lpnybsWXu9Xo0J5AY_X7GIw",
    },
    membership: { id: "mem_accountant_star", userId: "usr_accountant", companyId: "cmp_star", role: "ACCOUNTANT", objectId: null, unitId: null },
  },
  {
    user: {
      id: "usr_building",
      login: "building",
      name: "Олег Смирнов",
      passwordHash: "5xIz9aWFDpB6noZqqu88rA.RTDQFDCIWTNtUz7E8Fp5J_0e8ShM1UOA17wtN1hK4bE",
    },
    membership: {
      id: "mem_manager_park_2",
      userId: "usr_building",
      companyId: "cmp_star",
      role: "MANAGER",
      objectId: "obj_park",
      buildingId: "bld_2",
      unitId: null,
    },
  },
];

function normalize(people: PeopleFile): PeopleFile {
  for (const user of people.users) {
    user.email ??= "";
    user.phone ??= "";
    user.status ??= "ACTIVE";
    user.lastLoginAt ??= null;
    user.sessionVersion ??= 1;
  }
  for (const membership of people.memberships) {
    membership.status ??= "ACTIVE";
    membership.buildingId ??= null;
  }
  return people;
}

function withStaff(people: PeopleFile): PeopleFile {
  normalize(people);
  globalStore.__starHomePeople = people;
  if ((people.staffSeed ?? 0) >= staffSeedVersion) return people;
  for (const entry of demoStaff) {
    const taken = people.users.some((user) => user.id === entry.user.id || user.login === entry.user.login);
    if (taken) continue;
    people.users.push({ ...entry.user });
    people.memberships.push({ ...entry.membership });
  }
  people.staffSeed = staffSeedVersion;
  persist(normalize(people));
  return people;
}

const filePath = path.join(process.cwd(), "data", "people.json");
const globalStore = globalThis as typeof globalThis & { __starHomePeople?: PeopleFile };

function seed(): PeopleFile {
  return {
    users: [
      {
        id: "usr_stanislav",
        login: "stanislav",
        name: "Станислав",
        passwordHash: "Pq7ARURXypsboreUBmT-Xg.zM5JCIJH1zT06yVJzo8YE3i8g9tF-B2246sSN4vuSWU",
      },
      {
        id: "usr_maria",
        login: "maria",
        name: "Мария",
        passwordHash: "ArxzHY5U7CLQCq4fAwkumw.NPyeCaeuh3kH0dtHBsE173jQgs53A-QhO9-Ue8dS2Xw",
      },
      {
        id: "usr_admin",
        login: "admin",
        name: "Администратор",
        passwordHash: "Swksumg2WNm8W9r8SFCKVQ.d97JjX9SwoHHHzom0pLQ-Rpv3ydydSQ-twgfA3a3tes",
      },
    ],
    memberships: [
      {
        id: "mem_stanislav_24",
        userId: "usr_stanislav",
        companyId: "cmp_star",
        role: "RESIDENT",
        objectId: "obj_siyanie",
        unitId: "unit_24",
      },
      {
        id: "mem_maria_24",
        userId: "usr_maria",
        companyId: "cmp_star",
        role: "RESIDENT",
        objectId: "obj_siyanie",
        unitId: "unit_24",
      },
      {
        id: "mem_maria_84",
        userId: "usr_maria",
        companyId: "cmp_star",
        role: "RESIDENT",
        objectId: "obj_park",
        unitId: "unit_84",
      },
      {
        id: "mem_admin",
        userId: "usr_admin",
        companyId: "cmp_star",
        role: "COMPANY_ADMIN",
        objectId: null,
        unitId: null,
      },
    ],
  };
}

function load(): PeopleFile {
  if (globalStore.__starHomePeople) return globalStore.__starHomePeople;
  const bound = boundValue("people");
  if (bound) return withStaff(bound as PeopleFile);
  if (existsSync(filePath)) return withStaff(JSON.parse(readFileSync(filePath, "utf8")) as PeopleFile);
  return withStaff(seed());
}

function persist(people: PeopleFile): void {
  globalStore.__starHomePeople = people;
  if (remember("people", people)) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(people));
}

export function listUsers(): StoredUser[] {
  return load().users;
}

export function listMemberships(): Membership[] {
  return load().memberships;
}

export function createPerson(input: { login: string; name: string; passwordHash: string; email?: string; phone?: string }): StoredUser {
  const people = load();
  const user: StoredUser = {
    id: `usr_${randomBytes(8).toString("hex")}`,
    login: input.login,
    name: input.name,
    passwordHash: input.passwordHash,
    email: input.email ?? "",
    phone: input.phone ?? "",
    status: "ACTIVE",
    lastLoginAt: null,
    sessionVersion: 1,
  };
  people.users.push(user);
  persist(people);
  return user;
}

export function createResidentMembership(input: {
  userId: string;
  companyId: string;
  objectId: string;
  unitId: string;
  role?: Membership["role"];
  expiresAt?: string | null;
  passId?: string | null;
}): Membership {
  const people = load();
  const membership: Membership = {
    id: `mem_${randomBytes(8).toString("hex")}`,
    userId: input.userId,
    companyId: input.companyId,
    role: input.role ?? "RESIDENT",
    objectId: input.objectId,
    unitId: input.unitId,
    expiresAt: input.expiresAt ?? null,
    passId: input.passId ?? null,
    status: "ACTIVE",
  };
  people.memberships.push(membership);
  persist(people);
  return membership;
}

export function deleteMembership(membershipId: string): void {
  const people = load();
  const membership = people.memberships.find((item) => item.id === membershipId);
  people.memberships = people.memberships.filter((item) => item.id !== membershipId);
  if (membership && !people.memberships.some((item) => item.userId === membership.userId)) {
    people.users = people.users.filter((user) => user.id !== membership.userId);
  }
  persist(people);
}

export function updateUser(userId: string, patch: Partial<Pick<StoredUser, "name" | "email" | "phone" | "status" | "lastLoginAt">>): StoredUser | undefined {
  const people = load();
  const user = people.users.find((item) => item.id === userId);
  if (!user) return undefined;
  Object.assign(user, patch);
  persist(people);
  return user;
}

export function endSessions(userId: string): void {
  const people = load();
  const user = people.users.find((item) => item.id === userId);
  if (!user) return;
  user.sessionVersion = (user.sessionVersion ?? 1) + 1;
  persist(people);
}

export function createStaffMembership(input: {
  userId: string;
  companyId: string;
  role: Membership["role"];
  objectId: string | null;
  buildingId?: string | null;
  createdBy: string;
}): Membership {
  const people = load();
  const membership: Membership = {
    id: `mem_${randomBytes(8).toString("hex")}`,
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    objectId: input.objectId,
    buildingId: input.buildingId ?? null,
    unitId: null,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  people.memberships.push(membership);
  persist(people);
  return membership;
}

export function updateMembership(
  membershipId: string,
  patch: Partial<Pick<Membership, "role" | "objectId" | "buildingId" | "status" | "revokedAt" | "revokedBy">>,
): Membership | undefined {
  const people = load();
  const membership = people.memberships.find((item) => item.id === membershipId);
  if (!membership) return undefined;
  Object.assign(membership, patch);
  persist(people);
  return membership;
}
