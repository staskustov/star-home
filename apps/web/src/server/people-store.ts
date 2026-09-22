import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { boundValue, remember } from "@/server/store-bind";
import type { Membership } from "@/types/domain";

export type StoredUser = {
  id: string;
  login: string;
  name: string;
  passwordHash: string;
};

type PeopleFile = {
  users: StoredUser[];
  memberships: Membership[];
};

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
  if (bound) {
    globalStore.__starHomePeople = bound as PeopleFile;
    return globalStore.__starHomePeople;
  }
  if (existsSync(filePath)) {
    globalStore.__starHomePeople = JSON.parse(readFileSync(filePath, "utf8")) as PeopleFile;
    return globalStore.__starHomePeople;
  }
  const people = seed();
  persist(people);
  return people;
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

export function createPerson(input: { login: string; name: string; passwordHash: string }): StoredUser {
  const people = load();
  const user: StoredUser = {
    id: `usr_${randomBytes(8).toString("hex")}`,
    login: input.login,
    name: input.name,
    passwordHash: input.passwordHash,
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
