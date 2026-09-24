import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";

type Reply = { status: number; body: unknown };
type Rpc = (method: string, input: unknown, session: { userId: string; membershipId: string | null; sv?: number } | null) => Promise<Reply>;

const memory = new Map<string, unknown>();
bindStore({
  load: (name) => memory.get(name),
  save: (name, value) => {
    memory.set(name, JSON.parse(JSON.stringify(value)));
  },
});

const admin = { userId: "usr_admin", membershipId: "mem_admin" };
const objectAdmin = { userId: "usr_object", membershipId: "mem_object_siyanie" };
const manager = { userId: "usr_manager", membershipId: "mem_manager_siyanie" };
const resident = { userId: "usr_stanislav", membershipId: "mem_stanislav_24" };

type Dashboard = { scope: string; canCreateObject: boolean; objects: { id: string; feed: { id: string }[] | null }[] };
type Admin = { sections?: { label: string; items: { href: string; label: string }[] }[]; redirect?: string };

let rpc: Rpc;

before(async () => {
  rpc = (await import("../../web/src/server/rpc-handlers")).handleRpc;
});

function hrefs(body: Admin): string[] {
  return (body.sections ?? []).flatMap((group) => group.items.map((item) => item.href));
}

describe("dashboard", () => {
  it("requires a session", async () => {
    assert.equal((await rpc("dashboard", null, null)).status, 401);
  });

  it("is closed to residents", async () => {
    assert.equal((await rpc("dashboard", null, resident)).status, 403);
  });

  it("gives the company admin every object of the company", async () => {
    const reply = await rpc("dashboard", null, admin);
    const body = reply.body as Dashboard;
    assert.equal(reply.status, 200);
    assert.equal(body.scope, "COMPANY");
    assert.equal(body.canCreateObject, true);
    assert.ok(body.objects.some((object) => object.id === "obj_siyanie"));
    assert.ok(body.objects.some((object) => object.id === "obj_park"));
  });

  it("limits the object admin to the assigned object and ignores forged input", async () => {
    const reply = await rpc("dashboard", { objectId: "obj_park", role: "SUPER_ADMIN", companyId: "cmp_star" }, objectAdmin);
    const body = reply.body as Dashboard;
    assert.equal(reply.status, 200);
    assert.equal(body.scope, "OBJECT");
    assert.equal(body.canCreateObject, false);
    assert.deepEqual(
      body.objects.map((object) => object.id),
      ["obj_siyanie"],
    );
  });

  it("hides the audit feed from roles without audit.view", async () => {
    const body = (await rpc("dashboard", null, manager)).body as Dashboard;
    assert.deepEqual(
      body.objects.map((object) => object.id),
      ["obj_siyanie"],
    );
    for (const item of body.objects[0]?.feed ?? []) assert.ok(!item.id.startsWith("audit_"));
  });

  it("rejects an expired staff membership", async () => {
    const people = await import("../../web/src/server/people-store");
    const membership = people.listMemberships().find((item) => item.id === "mem_manager_siyanie");
    assert.ok(membership);
    membership.expiresAt = "2000-01-01T00:00:00";
    assert.equal((await rpc("dashboard", null, manager)).status, 403);
    membership.expiresAt = null;
  });
});

describe("navigation", () => {
  it("shows only sections the role is allowed to open", async () => {
    const company = hrefs((await rpc("admin", null, admin)).body as Admin);
    const managed = hrefs((await rpc("admin", null, manager)).body as Admin);
    assert.ok(company.includes("/admin/ai"));
    assert.ok(!managed.includes("/admin/ai"));
    assert.ok(managed.includes("/admin/requests"));
  });

  it("names the place by the object type", async () => {
    const body = (await rpc("admin", null, objectAdmin)).body as Admin;
    const place = body.sections?.flatMap((group) => group.items).find((item) => item.href === "/admin/objects");
    assert.equal(place?.label, "Посёлок");
  });

  it("gives the console shell only the structure of objects in scope", async () => {
    const body = (await rpc("admin", null, manager)).body as { objects: Record<string, unknown>[] };
    assert.deepEqual(
      body.objects.map((object) => object.id),
      ["obj_siyanie"],
    );
    assert.deepEqual(Object.keys(body.objects[0] ?? {}).sort(), ["buildings", "companyId", "id", "name", "type", "units"]);
  });

  it("sends residents away from the admin console", async () => {
    const body = (await rpc("admin", null, resident)).body as Admin;
    assert.equal(body.sections, undefined);
    assert.equal(body.redirect, "/home");
  });
});

describe("policy", () => {
  it("keeps household rights away from staff and staff rights away from households", async () => {
    const { permissionsOf } = await import("../../web/src/server/rbac/policy");
    for (const role of ["SUPER_ADMIN", "COMPANY_ADMIN", "OBJECT_ADMIN", "MANAGER", "SECURITY", "SERVICE_OPERATOR", "ACCOUNTANT"] as const) {
      const granted = permissionsOf(role);
      assert.ok(!granted.has("payments.pay"), `${role} must not pay for residents`);
      assert.ok(!granted.has("home.mode.switch"), `${role} must not switch a home mode`);
    }
    for (const role of ["RESIDENT", "FAMILY_MEMBER", "GUEST"] as const) {
      const granted = permissionsOf(role);
      assert.ok(!granted.has("dashboard.view"), `${role} must not open the admin dashboard`);
      assert.ok(!granted.has("users.role.assign"), `${role} must not assign roles`);
    }
  });

  it("reserves dangerous rights for the company level", async () => {
    const { permissionsOf } = await import("../../web/src/server/rbac/policy");
    for (const permission of ["roles.edit", "users.delete", "objects.delete", "audit.export"] as const) {
      assert.ok(permissionsOf("COMPANY_ADMIN").has(permission));
      assert.ok(!permissionsOf("OBJECT_ADMIN").has(permission), `OBJECT_ADMIN must not have ${permission}`);
    }
    assert.ok(!permissionsOf("SECURITY").has("payments.view"));
    assert.ok(!permissionsOf("ACCOUNTANT").has("access.gate.open"));
  });
});

type Member = { membershipId: string; userId: string; role: string; objectId: string | null; status: string; self: boolean; manageable: boolean };
type Board = { members: Member[]; roles: { value: string }[]; places: { id: string | null }[]; can: Record<string, boolean> };

describe("team", () => {
  const newcomer = { name: "Ирина Белова", login: "irina.belova", password: "password-8", role: "MANAGER", objectId: "obj_siyanie" };
  let added = "";

  it("is closed without users.view", async () => {
    assert.equal((await rpc("team", null, null)).status, 401);
    assert.equal((await rpc("team", null, resident)).status, 403);
    assert.equal((await rpc("team", null, manager)).status, 403);
    assert.equal((await rpc("teamAdd", newcomer, manager)).status, 403);
  });

  it("lists only staff inside the actor's scope", async () => {
    const company = (await rpc("team", null, admin)).body as Board;
    const object = (await rpc("team", null, objectAdmin)).body as Board;
    assert.ok(company.members.some((member) => member.membershipId === "mem_manager_siyanie"));
    assert.ok(!company.members.some((member) => member.role === "RESIDENT"));
    assert.ok(object.members.every((member) => member.objectId === "obj_siyanie"));
    assert.ok(!object.places.some((place) => place.id === null || place.id === "obj_park"));
    assert.deepEqual(
      object.roles.map((role) => role.value),
      ["MANAGER"],
    );
  });

  it("refuses roles and places above the actor", async () => {
    assert.equal((await rpc("teamAdd", { ...newcomer, role: "COMPANY_ADMIN", objectId: null }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamAdd", { ...newcomer, role: "OBJECT_ADMIN" }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamAdd", { ...newcomer, objectId: "obj_park" }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamAdd", { ...newcomer, role: "SUPER_ADMIN", objectId: null }, admin)).status, 403);
    assert.equal((await rpc("teamAdd", { ...newcomer, role: "RESIDENT" }, admin)).status, 400);
  });

  it("adds a member within scope and ignores forged company and creator", async () => {
    const reply = await rpc("teamAdd", { ...newcomer, companyId: "cmp_other", createdBy: "usr_admin" }, objectAdmin);
    assert.equal(reply.status, 201);
    added = (reply.body as { membershipId: string }).membershipId;
    const people = await import("../../web/src/server/people-store");
    const membership = people.listMemberships().find((item) => item.id === added);
    assert.equal(membership?.companyId, "cmp_star");
    assert.equal(membership?.createdBy, "usr_object");
    assert.equal((await rpc("teamAdd", newcomer, objectAdmin)).status, 409);
  });

  it("never lets anyone change their own access", async () => {
    assert.equal((await rpc("teamAccess", { membershipId: "mem_admin", role: "OBJECT_ADMIN", objectId: "obj_siyanie" }, admin)).status, 403);
    assert.equal((await rpc("teamBlock", { membershipId: "mem_object_siyanie" }, objectAdmin)).status, 403);
  });

  it("keeps lower roles away from higher ones and other objects", async () => {
    assert.equal((await rpc("teamBlock", { membershipId: "mem_admin" }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamEdit", { membershipId: "mem_admin", name: "Взлом" }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamAccess", { membershipId: added, role: "MANAGER", objectId: "obj_park" }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamBlock", { membershipId: "mem_stanislav_24" }, admin)).status, 404);
  });

  it("ends every session of a blocked member and refuses their login", async () => {
    const people = await import("../../web/src/server/people-store");
    const user = people.listUsers().find((item) => item.login === newcomer.login);
    assert.ok(user);
    const session = { userId: user.id, membershipId: added, sv: user.sessionVersion ?? 1 };
    assert.equal((await rpc("destination", null, session)).status, 200);
    assert.equal((await rpc("teamBlock", { membershipId: added }, objectAdmin)).status, 200);
    assert.equal((await rpc("destination", null, session)).status, 401);
    assert.equal((await rpc("destination", null, { ...session, sv: user.sessionVersion })).status, 401);
    assert.equal((await rpc("teamRestore", { membershipId: added }, objectAdmin)).status, 200);
    assert.equal((await rpc("destination", null, session)).status, 401);
  });

  it("revokes access on removal but keeps the person", async () => {
    const people = await import("../../web/src/server/people-store");
    const user = people.listUsers().find((item) => item.login === newcomer.login);
    assert.equal((await rpc("teamRemove", { membershipId: added }, objectAdmin)).status, 403);
    assert.equal((await rpc("teamRemove", { membershipId: added }, admin)).status, 200);
    const board = (await rpc("team", null, admin)).body as Board;
    assert.ok(!board.members.some((member) => member.membershipId === added));
    assert.ok(people.listUsers().some((item) => item.id === user?.id));
    assert.equal((await rpc("teamEdit", { membershipId: added, name: "Снова" }, admin)).status, 404);
  });

  it("always leaves one company admin", async () => {
    const people = await import("../../web/src/server/people-store");
    const root = people.createPerson({ login: "root.test", name: "Платформа", passwordHash: "x" });
    const membership = people.createStaffMembership({ userId: root.id, companyId: "cmp_star", role: "SUPER_ADMIN", objectId: null, createdBy: "test" });
    const platform = { userId: root.id, membershipId: membership.id };
    assert.equal((await rpc("teamBlock", { membershipId: "mem_admin" }, platform)).status, 409);
    assert.equal((await rpc("teamRemove", { membershipId: "mem_admin" }, platform)).status, 409);
    assert.equal((await rpc("teamAccess", { membershipId: "mem_admin", role: "OBJECT_ADMIN", objectId: "obj_siyanie" }, platform)).status, 409);
  });
});
