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
const security = { userId: "usr_security", membershipId: "mem_security_siyanie" };
const accountant = { userId: "usr_accountant", membershipId: "mem_accountant_star" };

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
      ["MANAGER", "SECURITY", "SERVICE_OPERATOR", "ACCOUNTANT"],
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

type Desk = Record<string, { objectId: string }[]>;
type Column = { value: string; editable: boolean; customized: boolean; ceiling: string[]; granted: string[]; locked: string[] };
type Roles = { canEdit: boolean; roles: Column[] };

describe("method policy", () => {
  it("refuses unknown methods and anonymous callers", async () => {
    assert.equal((await rpc("ops", null, admin)).status, 404);
    assert.equal((await rpc("__proto__", null, admin)).status, 404);
    assert.equal((await rpc("desk", { section: "access" }, null)).status, 401);
    assert.equal((await rpc("roles", null, null)).status, 401);
  });

  it("keeps staff methods away from residents and household methods away from staff", async () => {
    assert.equal((await rpc("desk", { section: "access" }, resident)).status, 403);
    assert.equal((await rpc("openObjectGate", { objectId: "obj_siyanie" }, resident)).status, 403);
    assert.equal((await rpc("pay", null, admin)).status, 403);
    assert.equal((await rpc("switchMode", { mode: "WORK" }, security)).status, 403);
  });

  it("checks the right of the method before the handler runs", async () => {
    assert.equal((await rpc("openObjectGate", { objectId: "obj_siyanie" }, accountant)).status, 403);
    assert.equal((await rpc("openObjectGate", { objectId: "obj_park" }, security)).status, 403);
    assert.equal((await rpc("removeObject", { objectId: "obj_siyanie" }, objectAdmin)).status, 403);
    assert.equal((await rpc("setRequestStatus", { id: "x", status: "DONE", objectId: "obj_siyanie" }, accountant)).status, 403);
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", name: "x" }, accountant)).status, 403);
  });
});

describe("console sections", () => {
  it("opens a section only with its right", async () => {
    assert.equal((await rpc("desk", { section: "payments" }, security)).status, 403);
    assert.equal((await rpc("desk", { section: "security" }, accountant)).status, 403);
    assert.equal((await rpc("desk", { section: "payments" }, accountant)).status, 200);
    assert.equal((await rpc("desk", { section: "security" }, security)).status, 200);
    assert.equal((await rpc("desk", { section: "ai" }, manager)).status, 403);
    assert.equal((await rpc("desk", { section: "nothing" }, admin)).status, 404);
  });

  it("serves only rows of objects in scope", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const invoice = file.invoices[0];
    assert.ok(invoice);
    ops.writeOps({ ...file, invoices: [...file.invoices, { ...invoice, id: "inv_park_test", objectId: "obj_park" }] });
    const company = (await rpc("desk", { section: "payments" }, admin)).body as Desk;
    const object = (await rpc("desk", { section: "payments" }, objectAdmin)).body as Desk;
    assert.ok(company.invoices?.some((row) => row.objectId === "obj_park"));
    assert.ok(object.invoices?.every((row) => row.objectId === "obj_siyanie"));
    ops.writeOps(file);
  });

  it("hides cameras and the audit trail inside a section without their rights", async () => {
    const body = (await rpc("desk", { section: "security" }, manager)).body as Desk;
    const own = (await rpc("desk", { section: "security" }, security)).body as Desk;
    assert.deepEqual(body.audit, []);
    assert.ok(Array.isArray(own.cameras));
  });

  it("sends a member to a section they may open", async () => {
    const { guardPath } = await import("../../web/src/server/routing");
    assert.deepEqual(guardPath(security.userId, security.membershipId, "/admin/security"), {});
    assert.equal(guardPath(security.userId, security.membershipId, "/admin/payments").redirect, "/admin");
    assert.equal(guardPath(accountant.userId, accountant.membershipId, "/admin/team").redirect, "/admin");
    assert.equal(guardPath(manager.userId, manager.membershipId, "/admin/roles").redirect, "/admin");
    assert.deepEqual(guardPath(admin.userId, admin.membershipId, "/admin/roles"), {});
    assert.equal(guardPath(resident.userId, resident.membershipId, "/admin").redirect, "/home");
  });

  it("gives each staff role its own console", async () => {
    const guard = hrefs((await rpc("admin", null, security)).body as Admin);
    const books = hrefs((await rpc("admin", null, accountant)).body as Admin);
    assert.ok(guard.includes("/admin/security") && !guard.includes("/admin/payments"));
    assert.ok(books.includes("/admin/payments") && !books.includes("/admin/security"));
    assert.ok(!guard.includes("/admin/roles") && !books.includes("/admin/team"));
  });
});

describe("roles", () => {
  it("shows the matrix only with roles.view", async () => {
    assert.equal((await rpc("roles", null, manager)).status, 403);
    assert.equal((await rpc("roles", null, resident)).status, 403);
    const body = (await rpc("roles", null, admin)).body as Roles;
    assert.equal(body.canEdit, true);
    assert.ok(!body.roles.some((role) => role.value === "SUPER_ADMIN"));
    assert.equal(body.roles.find((role) => role.value === "COMPANY_ADMIN")?.editable, false);
    assert.equal(body.roles.find((role) => role.value === "RESIDENT")?.editable, false);
    assert.equal(body.roles.find((role) => role.value === "MANAGER")?.editable, true);
  });

  it("refuses edits outside the actor's reach", async () => {
    const ceiling = (await import("../../web/src/server/rbac/policy")).permissionsOf("MANAGER");
    const all = [...ceiling];
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: all }, objectAdmin)).status, 403);
    assert.equal((await rpc("rolesSave", { role: "COMPANY_ADMIN", permissions: [] }, admin)).status, 403);
    assert.equal((await rpc("rolesSave", { role: "SUPER_ADMIN", permissions: [] }, admin)).status, 403);
    assert.equal((await rpc("rolesSave", { role: "RESIDENT", permissions: [] }, admin)).status, 403);
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: [...all, "roles.edit"] }, admin)).status, 400);
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: [...all, "made.up"] }, admin)).status, 400);
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: "all" }, admin)).status, 400);
    assert.equal((await rpc("rolesSave", { role: "NOBODY", permissions: [] }, admin)).status, 400);
  });

  it("removes a right at once and brings it back with the standard set", async () => {
    const ceiling = [...(await import("../../web/src/server/rbac/policy")).permissionsOf("MANAGER")];
    assert.equal((await rpc("desk", { section: "devices" }, manager)).status, 200);
    const trimmed = ceiling.filter((permission) => permission !== "devices.view" && permission !== "dashboard.view");
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: trimmed }, admin)).status, 200);
    assert.equal((await rpc("desk", { section: "devices" }, manager)).status, 403);
    assert.equal((await rpc("dashboard", null, manager)).status, 200, "dashboard.view stays locked");
    const column = ((await rpc("roles", null, admin)).body as Roles).roles.find((role) => role.value === "MANAGER");
    assert.equal(column?.customized, true);
    assert.ok(!column?.granted.includes("devices.view"));
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: ceiling }, admin)).status, 200);
    assert.equal((await rpc("desk", { section: "devices" }, manager)).status, 200);
    const restored = ((await rpc("roles", null, admin)).body as Roles).roles.find((role) => role.value === "MANAGER");
    assert.equal(restored?.customized, false);
  });

  it("never lets an actor grant a right they do not hold", async () => {
    const policy = await import("../../web/src/server/rbac/policy");
    const catalog = await import("../../web/src/server/catalog-store");
    const adminCeiling = [...policy.permissionsOf("COMPANY_ADMIN")].filter((permission) => permission !== "devices.view");
    catalog.setCompanyGrants("cmp_star", "COMPANY_ADMIN", adminCeiling);
    const managerCeiling = [...policy.permissionsOf("MANAGER")];
    const without = managerCeiling.filter((permission) => permission !== "devices.view");
    catalog.setCompanyGrants("cmp_star", "MANAGER", without);
    const reply = await rpc("rolesSave", { role: "MANAGER", permissions: managerCeiling }, admin);
    assert.equal(reply.status, 403);
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: without.filter((item) => item !== "service.edit") }, admin)).status, 200);
    catalog.setCompanyGrants("cmp_star", "COMPANY_ADMIN", null);
    catalog.setCompanyGrants("cmp_star", "MANAGER", null);
  });

  it("keeps household rights as they were", async () => {
    const reply = await rpc("home", null, resident);
    assert.equal(reply.status, 200);
    assert.equal((await rpc("roles", null, admin)).status, 200);
    const column = ((await rpc("roles", null, admin)).body as Roles).roles.find((role) => role.value === "RESIDENT");
    assert.deepEqual(column?.granted, column?.ceiling);
  });
});

const building = { userId: "usr_building", membershipId: "mem_manager_park_2" };
const unitOne = "unit_obj_park_1";
const unitTwo = "unit_84";

type Rows = Record<string, { id?: string; objectId: string; name?: string }[]>;
type Tree = { buildings: { id: string; units: { id: string }[] }[] | null; can: Record<string, boolean> };

describe("building scope", () => {
  let restore: () => void = () => {};

  before(async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const request = (id: string, unitId: string) => ({
      id,
      companyId: "cmp_star",
      objectId: "obj_park",
      unitId,
      authorUserId: "usr_test",
      category: "Сантехника",
      text: "Тест",
      status: "CREATED" as const,
    });
    ops.writeOps({
      ...file,
      requests: [...file.requests, request("req_park_1", unitOne), request("req_park_2", unitTwo)],
      devices: [
        ...file.devices,
        { id: "dev_park_gate", companyId: "cmp_star", objectId: "obj_park", unitId: null, kind: "GATE", name: "Въезд Парк", adapter: "local" },
        { id: "dev_park_1_leak", companyId: "cmp_star", objectId: "obj_park", unitId: unitOne, kind: "LEAK", name: "Протечка 1", adapter: "local" },
      ],
    });
    restore = () => ops.writeOps(file);
  });

  it("builds a building scope only from a building of the same object", async () => {
    const { staffActor } = await import("../../web/src/server/rbac/decide");
    const actor = staffActor(building);
    assert.ok(actor.ok);
    assert.deepEqual(actor.value.scope, { kind: "BUILDING", objectId: "obj_park", buildingId: "bld_2" });
    const people = await import("../../web/src/server/people-store");
    const broken = people.createStaffMembership({ userId: "usr_building", companyId: "cmp_star", role: "MANAGER", objectId: "obj_siyanie", buildingId: "bld_2", createdBy: "test" });
    assert.equal(staffActor({ userId: "usr_building", membershipId: broken.id }).ok, false);
    people.updateMembership(broken.id, { status: "REVOKED" });
  });

  it("serves only rows of units in the building plus shared infrastructure", async () => {
    const own = (await rpc("desk", { section: "requests" }, building)).body as Rows;
    const all = (await rpc("desk", { section: "requests" }, admin)).body as Rows;
    const ids = (own.requests ?? []).map((row) => row.id);
    assert.ok(ids.includes("req_park_2"));
    assert.ok(!ids.includes("req_park_1"));
    assert.ok((own.requests ?? []).every((row) => row.objectId === "obj_park"));
    assert.ok((all.requests ?? []).some((row) => row.id === "req_park_1"));
    const devices = (await rpc("desk", { section: "devices" }, building)).body as Rows;
    const names = (devices.devices ?? []).map((row) => row.name);
    assert.ok(names.includes("Въезд Парк"), "shared gate stays visible");
    assert.ok(!names.includes("Протечка 1"));
  });

  it("changes only requests inside the building", async () => {
    assert.equal((await rpc("setRequestStatus", { id: "req_park_1", status: "ACCEPTED", objectId: "obj_park" }, building)).status, 403);
    assert.equal((await rpc("setRequestStatus", { id: "req_park_2", status: "ACCEPTED", objectId: "obj_park" }, building)).status, 200);
    assert.equal((await rpc("setRequestStatus", { id: "req_park_2", status: "ACCEPTED", objectId: "obj_siyanie" }, building)).status, 403);
  });

  it("shows the building and lets it change units only inside it", async () => {
    const reply = await rpc("tree", { objectId: "obj_park" }, building);
    const tree = reply.body as Tree;
    assert.equal(reply.status, 200);
    assert.deepEqual(
      tree.buildings?.map((item) => item.id),
      ["bld_2"],
    );
    assert.equal(tree.can.buildings, false);
    assert.equal(tree.can.edit, false);
    assert.equal(tree.can.structure, true);
    assert.equal((await rpc("createBuilding", { objectId: "obj_park", name: "Корпус 9" }, building)).status, 403);
    assert.equal((await rpc("removeBuilding", { buildingId: "bld_park_1" }, building)).status, 403);
    assert.equal((await rpc("createUnit", { objectId: "obj_park", name: "Квартира 999", buildingId: "bld_park_1" }, building)).status, 403);
    assert.equal((await rpc("removeUnit", { unitId: unitOne }, building)).status, 403);
    const created = await rpc("createUnit", { objectId: "obj_park", name: "Квартира 999", buildingId: "bld_2" }, building);
    assert.equal(created.status, 201);
    assert.equal((await rpc("removeUnit", { unitId: (created.body as { id: string }).id }, building)).status, 200);
  });

  it("keeps residents of other buildings out of sight and out of reach", async () => {
    const people = await import("../../web/src/server/people-store");
    const neighbour = people.createPerson({ login: "neighbour.test", name: "Сосед", passwordHash: "x" });
    const far = people.createResidentMembership({ userId: neighbour.id, companyId: "cmp_star", objectId: "obj_park", unitId: unitOne });
    const board = (await rpc("residents", null, building)).body as { people: { membershipId: string; unitId: string }[]; objects: { groups: { label: string | null }[] }[] };
    assert.ok(!board.people.some((person) => person.membershipId === far.id));
    assert.ok(board.people.every((person) => person.unitId !== unitOne));
    assert.deepEqual(
      board.objects.flatMap((object) => object.groups.map((group) => group.label)),
      ["Корпус 2"],
    );
    const newcomer = { objectId: "obj_park", name: "Новый", login: "new.resident.test", password: "secret-1" };
    assert.equal((await rpc("addResident", { ...newcomer, unitId: unitOne }, building)).status, 403);
    assert.equal((await rpc("addResident", { ...newcomer, unitId: "unit_missing" }, building)).status, 404);
    assert.equal((await rpc("removeResident", { membershipId: "mem_missing" }, admin)).status, 404);
    assert.equal((await rpc("removeResident", { membershipId: far.id }, admin)).status, 200);
  });

  it("counts only the building on the dashboard", async () => {
    const catalog = await import("../../web/src/server/catalog-store");
    const body = (await rpc("dashboard", null, building)).body as { objects: { id: string; typeLabel: string; pulse: { id: string; value: number }[] }[] };
    assert.deepEqual(
      body.objects.map((object) => object.id),
      ["obj_park"],
    );
    assert.ok(body.objects[0]?.typeLabel.endsWith("Корпус 2"));
    assert.equal(body.objects[0]?.pulse.find((item) => item.id === "units")?.value, catalog.unitIdsOfBuilding("bld_2").length);
  });

  it("answers 403 inside the company and 404 outside it", async () => {
    assert.equal((await rpc("tree", { objectId: "obj_siyanie" }, building)).status, 403);
    assert.equal((await rpc("tree", { objectId: "obj_missing" }, building)).status, 404);
    assert.equal((await rpc("tree", { objectId: "obj_park" }, objectAdmin)).status, 403);
    assert.equal((await rpc("removeUnit", { unitId: "unit_missing" }, admin)).status, 404);
  });

  it("ends the test data", () => {
    restore();
  });
});

describe("team with buildings", () => {
  let added = "";

  it("offers buildings only for roles that work per building", async () => {
    const board = (await rpc("team", null, admin)).body as { places: { key: string; buildingId: string | null; label: string }[]; roles: { value: string; perBuilding: boolean }[] };
    assert.ok(board.places.some((place) => place.buildingId === "bld_park_1" && place.label.endsWith(" · Корпус 1")));
    assert.equal(board.roles.find((role) => role.value === "MANAGER")?.perBuilding, true);
    assert.equal(board.roles.find((role) => role.value === "OBJECT_ADMIN")?.perBuilding, false);
  });

  it("assigns a building and checks it on the server", async () => {
    const person = { name: "Корпусный", login: "corpus.test", password: "password-8", role: "MANAGER" };
    assert.equal((await rpc("teamAdd", { ...person, role: "OBJECT_ADMIN", objectId: "obj_park", buildingId: "bld_park_1" }, admin)).status, 400);
    assert.equal((await rpc("teamAdd", { ...person, objectId: "obj_siyanie", buildingId: "bld_park_1" }, admin)).status, 404);
    assert.equal((await rpc("teamAdd", { ...person, objectId: "obj_park", buildingId: "bld_park_1" }, objectAdmin)).status, 403);
    const reply = await rpc("teamAdd", { ...person, objectId: "obj_park", buildingId: "bld_park_1" }, admin);
    assert.equal(reply.status, 201);
    added = (reply.body as { membershipId: string }).membershipId;
    const people = await import("../../web/src/server/people-store");
    const user = people.listUsers().find((item) => item.login === person.login);
    assert.ok(user);
    const session = { userId: user.id, membershipId: added };
    const rows = (await rpc("desk", { section: "requests" }, session)).body as Rows;
    assert.ok((rows.requests ?? []).every((row) => row.objectId === "obj_park"));
    assert.equal((await rpc("teamAccess", { membershipId: added, role: "MANAGER", objectId: "obj_park", buildingId: "bld_2" }, admin)).status, 200);
    const membership = people.listMemberships().find((item) => item.id === added);
    assert.equal(membership?.buildingId, "bld_2");
    const empty = await rpc("createBuilding", { objectId: "obj_park", name: "Корпус 7" }, admin);
    const spare = (empty.body as { id: string }).id;
    assert.equal((await rpc("teamAccess", { membershipId: added, role: "MANAGER", objectId: "obj_park", buildingId: spare }, admin)).status, 200);
    assert.equal((await rpc("removeBuilding", { buildingId: spare }, admin)).status, 409, "a building with staff stays");
    assert.equal((await rpc("teamAccess", { membershipId: added, role: "MANAGER", objectId: "obj_park", buildingId: null }, admin)).status, 200);
    assert.equal((await rpc("removeBuilding", { buildingId: spare }, admin)).status, 200);
    assert.equal(people.listMemberships().find((item) => item.id === added)?.buildingId, null);
    assert.equal((await rpc("teamRemove", { membershipId: added }, admin)).status, 200);
  });
});

describe("security audit", () => {
  it("shows the guard only access and security records", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const entry = (id: string, action: string) => ({
      id,
      actorUserId: "usr_admin",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      action,
      target: "Тест",
      result: "SUCCESS" as const,
      error: "",
      at: "24.09 10:00",
    });
    ops.writeOps({ ...file, audit: [...file.audit, entry("aud_gate_test", "OPEN_GATE"), entry("aud_team_test", "TEAM_ADD"), entry("aud_pay_test", "PAY_INVOICE")] });
    const guard = (((await rpc("desk", { section: "security" }, security)).body as Rows).audit ?? []).map((row) => row.id);
    const chief = (((await rpc("desk", { section: "security" }, admin)).body as Rows).audit ?? []).map((row) => row.id);
    assert.ok(guard.includes("aud_gate_test"));
    assert.ok(!guard.includes("aud_team_test") && !guard.includes("aud_pay_test"));
    assert.ok(chief.includes("aud_team_test") && chief.includes("aud_pay_test"));
    ops.writeOps(file);
  });
});

describe("self scope", () => {
  it("shows a family member only their own requests and a guest only their pass", async () => {
    const people = await import("../../web/src/server/people-store");
    const kid = people.createPerson({ login: "kid.test", name: "Ребёнок", passwordHash: "x" });
    const family = people.createResidentMembership({ userId: kid.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", role: "FAMILY_MEMBER" });
    const kidSession = { userId: kid.id, membershipId: family.id };
    assert.equal((await rpc("addRequest", { category: "Сантехника", text: "От жителя" }, resident)).status, 200);
    assert.equal((await rpc("addRequest", { category: "Сантехника", text: "От ребёнка" }, kidSession)).status, 200);
    type Requests = { requests: { text: string }[] };
    const own = ((await rpc("requests", null, kidSession)).body as Requests).requests.map((row) => row.text);
    const parent = ((await rpc("requests", null, resident)).body as Requests).requests.map((row) => row.text);
    assert.ok(own.includes("От ребёнка") && !own.includes("От жителя"));
    assert.ok(parent.includes("От ребёнка") && parent.includes("От жителя"));
    assert.equal((await rpc("pay", null, kidSession)).status, 403);

    assert.equal((await rpc("addPass", { guestName: "Второй гость", detail: "Сегодня" }, resident)).status, 200);
    const ops = await import("../../web/src/server/ops-store");
    const passes = ops.readOps().passes.filter((pass) => pass.unitId === "unit_24");
    const mine = passes[0];
    assert.ok(mine && passes.length > 1);
    const visitor = people.createPerson({ login: "visitor.test", name: "Гость", passwordHash: "x" });
    const pass = people.createResidentMembership({ userId: visitor.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", role: "GUEST", passId: mine.id, expiresAt: "2999-01-01T00:00:00" });
    const guestSession = { userId: visitor.id, membershipId: pass.id };
    const card = (await rpc("guest", null, guestSession)).body as { pass: { code: string } | null };
    assert.equal(card.pass?.code, mine.code);
    const access = (await rpc("access", null, guestSession)).body as { passes?: unknown[]; redirect?: string };
    assert.equal(access.passes, undefined, "a guest never sees the unit's other passes");
  });
});
