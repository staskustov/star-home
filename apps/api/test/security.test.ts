import "./register-paths";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";

type Reply = { status: number; body: unknown };
type Session = { userId: string; membershipId: string | null; sv?: number };
type Rpc = (method: string, input: unknown, session: Session | null) => Promise<Reply>;
type Access = Readonly<Record<string, { access: "public" | "session" | "staff"; permission: string | null }>>;

const memory = new Map<string, unknown>();
bindStore({
  load: (name) => memory.get(name),
  save: (name, value) => {
    memory.set(name, JSON.parse(JSON.stringify(value)));
  },
});

const staff: Record<string, Session> = {
  COMPANY_ADMIN: { userId: "usr_admin", membershipId: "mem_admin" },
  OBJECT_ADMIN: { userId: "usr_object", membershipId: "mem_object_siyanie" },
  MANAGER: { userId: "usr_manager", membershipId: "mem_manager_siyanie" },
  BUILDING_MANAGER: { userId: "usr_building", membershipId: "mem_manager_park_2" },
  SECURITY: { userId: "usr_security", membershipId: "mem_security_siyanie" },
  SERVICE_OPERATOR: { userId: "usr_service", membershipId: "mem_service_siyanie" },
  ACCOUNTANT: { userId: "usr_accountant", membershipId: "mem_accountant_star" },
};
const resident: Session = { userId: "usr_stanislav", membershipId: "mem_stanislav_24" };

const householdNeeds: Record<string, string> = {
  openGate: "access.gate.open",
  openPoint: "access.gate.open",
  addPass: "access.pass.create",
  pay: "payments.pay",
  alarm: "security.alarm.raise",
  raiseSos: "security.alarm.raise",
  sendSecurityMessage: "security.alarm.raise",
  ask: "ai.use",
  switchMode: "home.mode.switch",
  addRequest: "service.create",
  commandDeviceSmart: "devices.command",
  runHomeAction: "devices.command",
};

let rpc: Rpc;
let access: Access;

before(async () => {
  const handlers = await import("../../web/src/server/rpc-handlers");
  rpc = handlers.handleRpc;
  access = handlers.rpcAccess;
  (await import("../../web/src/server/audit-store")).listAudit();
  for (const session of Object.values(staff)) await rpc("dashboard", null, session);
  await rpc("home", null, resident);
});

function state(): string {
  return JSON.stringify([...memory].filter(([name]) => name !== "audit").sort(([left], [right]) => left.localeCompare(right)));
}

async function permissionsOf(session: Session): Promise<Set<string>> {
  const { staffActor } = await import("../../web/src/server/rbac/decide");
  const actor = staffActor(session);
  assert.ok(actor.ok, `${session.membershipId} builds a staff actor`);
  return new Set(actor.value.permissions);
}

describe("method table", () => {
  it("opens only sign-in and the push key to anonymous callers", async () => {
    const open = Object.entries(access)
      .filter(([, route]) => route.access === "public")
      .map(([method]) => method)
      .sort();
    assert.deepEqual(open, ["login", "pushKey"]);
    for (const [method, route] of Object.entries(access)) {
      if (route.access === "public") continue;
      assert.equal((await rpc(method, {}, null)).status, 401, method);
    }
  });

  it("gives every staff method a permission", () => {
    for (const [method, route] of Object.entries(access)) {
      if (route.access === "staff") assert.ok(route.permission, method);
    }
  });

  it("answers 404 to unknown and prototype method names", async () => {
    for (const method of ["", "constructor", "__proto__", "toString", "hasOwnProperty", "dropAll"]) {
      assert.equal((await rpc(method, {}, staff.COMPANY_ADMIN ?? null)).status, 404, method);
    }
  });
});

describe("role × method matrix", () => {
  it("refuses every staff method without its permission and changes nothing", async () => {
    let checked = 0;
    for (const [role, session] of Object.entries(staff)) {
      const granted = await permissionsOf(session);
      for (const [method, route] of Object.entries(access)) {
        if (route.access !== "staff" || !route.permission || granted.has(route.permission)) continue;
        const before = state();
        const reply = await rpc(method, { objectId: "obj_siyanie", membershipId: "mem_admin", role: "SUPER_ADMIN" }, session);
        assert.equal(reply.status, 403, `${role} → ${method}`);
        assert.equal(state(), before, `${role} → ${method} left the stores untouched`);
        checked += 1;
      }
    }
    assert.ok(checked > 60, `checked ${checked} pairs`);
  });

  it("closes every staff method to households", async () => {
    const people = await import("../../web/src/server/people-store");
    const kid = people.createPerson({ login: "matrix.kid", name: "Ребёнок", passwordHash: "x" });
    const family = people.createResidentMembership({ userId: kid.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", role: "FAMILY_MEMBER" });
    const visitor = people.createPerson({ login: "matrix.guest", name: "Гость", passwordHash: "x" });
    const guest = people.createResidentMembership({ userId: visitor.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", role: "GUEST", expiresAt: "2999-01-01T00:00:00" });
    const households = [resident, { userId: kid.id, membershipId: family.id }, { userId: visitor.id, membershipId: guest.id }];
    for (const session of households) {
      for (const [method, route] of Object.entries(access)) {
        if (route.access !== "staff") continue;
        const before = state();
        assert.equal((await rpc(method, { objectId: "obj_siyanie" }, session)).status, 403, `${session.membershipId} → ${method}`);
        assert.equal(state(), before);
      }
    }
  });

  it("checks household rights by role", async () => {
    const { householdCan } = await import("../../web/src/server/rbac/policy");
    const people = await import("../../web/src/server/people-store");
    const roles = ["FAMILY_MEMBER", "GUEST"] as const;
    for (const role of roles) {
      const person = people.createPerson({ login: `rights.${role.toLowerCase()}`, name: role, passwordHash: "x" });
      const membership = people.createResidentMembership({ userId: person.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", role, expiresAt: "2999-01-01T00:00:00" });
      const session = { userId: person.id, membershipId: membership.id };
      for (const [method, permission] of Object.entries(householdNeeds)) {
        if (householdCan(role, permission as never)) continue;
        const before = state();
        const reply = await rpc(method, { mode: "WORK", guestName: "Тест", detail: "Сегодня", pointId: "gate", prompt: "открой ворота", category: "Сантехника", text: "Тест", body: "Тест" }, session);
        assert.ok(reply.status === 403 || (reply.body as { redirect?: string } | null)?.redirect, `${role} → ${method}: ${reply.status}`);
        assert.equal(state(), before, `${role} → ${method} left the stores untouched`);
      }
    }
  });

  it("closes household actions to staff without a home", async () => {
    for (const method of ["openGate", "openPoint", "addPass", "pay", "alarm", "raiseSos", "sendSecurityMessage", "switchMode"]) {
      const before = state();
      const reply = await rpc(method, { mode: "WORK", guestName: "Тест", detail: "Сегодня", pointId: "gate" }, staff.COMPANY_ADMIN ?? null);
      assert.equal(reply.status, 403, method);
      assert.equal(state(), before, method);
    }
  });
});

describe("another company", () => {
  const rival = { companyId: "cmp_rival", objectId: "", buildingId: "", unitId: "", residentId: "", adminId: "", requestId: "" };

  before(async () => {
    const catalog = await import("../../web/src/server/catalog-store");
    const people = await import("../../web/src/server/people-store");
    const ops = await import("../../web/src/server/ops-store");
    const object = catalog.createCatalogObject({ companyId: rival.companyId, name: "Чужой ЖК", type: "RESIDENTIAL_COMPLEX", address: "Где-то" });
    const building = catalog.createCatalogBuilding(object.id, "Чужой корпус");
    const unit = catalog.createCatalogUnit({ objectId: object.id, buildingId: building.id, name: "Чужая квартира", type: "RESIDENTIAL_COMPLEX" });
    const person = people.createPerson({ login: "rival.resident", name: "Чужой житель", passwordHash: "x" });
    const owner = people.createPerson({ login: "rival.admin", name: "Чужой админ", passwordHash: "x" });
    rival.objectId = object.id;
    rival.buildingId = building.id;
    rival.unitId = unit.id;
    rival.residentId = people.createResidentMembership({ userId: person.id, companyId: rival.companyId, objectId: object.id, unitId: unit.id }).id;
    rival.adminId = people.createStaffMembership({ userId: owner.id, companyId: rival.companyId, role: "COMPANY_ADMIN", objectId: null, createdBy: "test" }).id;
    rival.requestId = "req_rival";
    const file = ops.readOps();
    ops.writeOps({
      ...file,
      requests: [
        ...file.requests,
        { id: rival.requestId, companyId: rival.companyId, objectId: object.id, unitId: unit.id, authorUserId: person.id, category: "Сантехника", text: "Чужая заявка", status: "CREATED" } as (typeof file.requests)[number],
      ],
    });
  });

  it("answers 404 to foreign ids and changes nothing", async () => {
    const admin = staff.COMPANY_ADMIN ?? null;
    const calls: [string, Record<string, unknown>][] = [
      ["tree", { objectId: rival.objectId }],
      ["updateObject", { objectId: rival.objectId, name: "Захват", address: "—" }],
      ["removeObject", { objectId: rival.objectId }],
      ["createBuilding", { objectId: rival.objectId, name: "Захват" }],
      ["removeBuilding", { buildingId: rival.buildingId }],
      ["updateBuilding", { buildingId: rival.buildingId, name: "Захват" }],
      ["createUnit", { objectId: rival.objectId, name: "Захват", buildingId: rival.buildingId }],
      ["updateUnit", { unitId: rival.unitId, name: "Захват" }],
      ["unitDetails", { unitId: rival.unitId }],
      ["removeUnit", { unitId: rival.unitId }],
      ["createRoom", { unitId: rival.unitId, name: "Захват" }],
      ["updateRoom", { roomId: "room_rival", name: "Захват" }],
      ["removeRoom", { roomId: "room_rival" }],
      ["listDevices", { objectId: rival.objectId }],
      ["registerDevice", { objectId: rival.objectId, name: "Захват", kind: "LIGHTING" }],
      ["updateDevice", { deviceId: "dev_rival", name: "Захват" }],
      ["removeDevice", { deviceId: "dev_rival" }],
      ["listGateways", { objectId: rival.objectId }],
      ["createGateway", { objectId: rival.objectId, name: "Захват" }],
      ["updateGateway", { gatewayId: "gw_rival", name: "Захват" }],
      ["removeGateway", { gatewayId: "gw_rival" }],
      ["smartHomeStatus", { objectId: rival.objectId }],
      ["smartHomeDevices", { objectId: rival.objectId }],
      ["smartHomeDevice", { deviceId: "dev_rival" }],
      ["commandDeviceSmart", { deviceId: "dev_rival", command: "setPower", value: true }],
      ["createScenario", { objectId: rival.objectId, name: "Захват", steps: [{ deviceId: "dev_rival", command: "setPower", value: true }] }],
      ["runScenario", { scenarioId: "scen_rival" }],
      ["pairGateway", { gatewayId: "gw_rival" }],
      ["placeDevice", { deviceId: "dev_rival", planFloor: 1, planX: 10, planY: 10 }],
      ["floorPlan", { unitId: rival.unitId }],
      ["rotateGateway", { gatewayId: "gw_rival" }],
      ["revokeGateway", { gatewayId: "gw_rival" }],
      ["smartHomeCommandLog", { objectId: rival.objectId }],
      ["setDeviceFavorite", { deviceId: "dev_rival", favorite: true }],
      ["smartHomeEvents", { objectId: rival.objectId }],
      ["createAccessPoint", { objectId: rival.objectId, name: "Захват", api: "" }],
      ["updateAccessPoint", { objectId: rival.objectId, pointId: "dev_gate_rival", name: "Захват" }],
      ["removeAccessPoint", { objectId: rival.objectId, pointId: "dev_gate_rival" }],
      ["closeObjectPoint", { objectId: rival.objectId, pointId: "dev_gate_rival" }],
      ["addResident", { objectId: rival.objectId, unitId: rival.unitId, name: "Захват", login: "grab.test", password: "secret-12" }],
      ["updateResident", { membershipId: rival.residentId, name: "Захват", login: "grab.test", unitId: rival.unitId, role: "RESIDENT" }],
      ["removeResident", { membershipId: rival.residentId }],
      ["teamEdit", { membershipId: rival.adminId, name: "Захват" }],
      ["teamAccess", { membershipId: rival.adminId, role: "MANAGER", objectId: null }],
      ["teamBlock", { membershipId: rival.adminId }],
      ["teamRestore", { membershipId: rival.adminId }],
      ["teamRemove", { membershipId: rival.adminId }],
      ["saveMode", { objectId: rival.objectId, setting: { mode: "HOME" } }],
      ["openObjectGate", { objectId: rival.objectId }],
      ["cameraFrame", { objectId: rival.objectId, deviceId: "dev_camera_rival" }],
      ["securityCameras", { objectId: rival.objectId }],
      ["securityPost", { objectId: rival.objectId }],
      ["sendSecurityReply", { objectId: rival.objectId, unitId: rival.unitId, body: "Захват" }],
      ["setRequestStatus", { id: rival.requestId, status: "DONE", objectId: rival.objectId }],
    ];
    for (const [method, input] of calls) {
      const before = state();
      const reply = await rpc(method, input, admin);
      assert.equal(reply.status, 404, `${method}: ${reply.status} ${JSON.stringify(reply.body)}`);
      assert.equal(state(), before, `${method} left the stores untouched`);
    }
  });

  it("never lists foreign rows", async () => {
    const admin = staff.COMPANY_ADMIN ?? null;
    const secrets = [rival.objectId, rival.buildingId, rival.unitId, rival.residentId, rival.adminId, rival.requestId, "Чужой", "Чужая"];
    const reads: [string, unknown][] = [
      ["dashboard", null],
      ["admin", null],
      ["team", null],
      ["residents", null],
      ["settings", null],
      ["roles", null],
      ["audit", { limit: 500 }],
      ...["access", "security", "requests", "payments", "devices", "ai"].map((section) => ["desk", { section }] as [string, unknown]),
    ];
    for (const [method, input] of reads) {
      const reply = await rpc(method, input, admin);
      assert.equal(reply.status, 200, method);
      const text = JSON.stringify(reply.body);
      for (const secret of secrets) assert.ok(!text.includes(secret), `${method} leaks ${secret}`);
    }
  });

  it("keeps the foreign admin out of this company", async () => {
    const people = await import("../../web/src/server/people-store");
    const owner = people.listMemberships().find((item) => item.id === rival.adminId);
    assert.ok(owner);
    const session = { userId: owner.userId, membershipId: owner.id };
    assert.equal((await rpc("tree", { objectId: "obj_siyanie" }, session)).status, 404);
    assert.equal((await rpc("teamBlock", { membershipId: "mem_object_siyanie" }, session)).status, 404);
    assert.equal((await rpc("removeResident", { membershipId: "mem_stanislav_24" }, session)).status, 404);
    const board = JSON.stringify((await rpc("dashboard", null, session)).body);
    assert.ok(!board.includes("obj_siyanie") && !board.includes("obj_park"));
  });
});

describe("dead sessions", () => {
  it("drops a blocked user and a stale session version everywhere", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "dead.session", name: "Сотрудник", passwordHash: "x" });
    const membership = people.createStaffMembership({ userId: person.id, companyId: "cmp_star", role: "OBJECT_ADMIN", objectId: "obj_siyanie", createdBy: "test" });
    const session = { userId: person.id, membershipId: membership.id, sv: 1 };
    assert.equal((await rpc("dashboard", null, session)).status, 200);

    people.endSessions(person.id);
    for (const [method, route] of Object.entries(access)) {
      if (route.access !== "public") assert.equal((await rpc(method, {}, session)).status, 401, `stale → ${method}`);
    }
    const fresh = { ...session, sv: 2 };
    assert.equal((await rpc("dashboard", null, fresh)).status, 200);

    people.updateUser(person.id, { status: "BLOCKED" });
    for (const [method, route] of Object.entries(access)) {
      if (route.access !== "public") assert.equal((await rpc(method, {}, fresh)).status, 401, `blocked → ${method}`);
    }
  });

  it("drops a revoked staff membership", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "revoked.session", name: "Сотрудник", passwordHash: "x" });
    const membership = people.createStaffMembership({ userId: person.id, companyId: "cmp_star", role: "OBJECT_ADMIN", objectId: "obj_siyanie", createdBy: "test" });
    const session = { userId: person.id, membershipId: membership.id };
    people.updateMembership(membership.id, { status: "REVOKED" });
    for (const [method, route] of Object.entries(access)) {
      if (route.access === "staff") assert.equal((await rpc(method, {}, session)).status, 403, `revoked → ${method}`);
    }
  });

  it("drops an expired household membership", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "expired.family", name: "Бывший жилец", passwordHash: "x" });
    const membership = people.createResidentMembership({ userId: person.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24", role: "FAMILY_MEMBER", expiresAt: "2000-01-01T00:00:00" });
    const session = { userId: person.id, membershipId: membership.id };
    for (const method of [...Object.keys(householdNeeds), "liveToken"]) {
      const before = state();
      const reply = await rpc(method, { mode: "WORK", guestName: "Тест", detail: "Сегодня", pointId: "gate", prompt: "открой ворота", category: "Сантехника", text: "Тест", body: "Тест" }, session);
      assert.ok(reply.status === 403 || (reply.body as { redirect?: string } | null)?.redirect, `expired → ${method}: ${reply.status}`);
      assert.equal(state(), before, `expired → ${method} left the stores untouched`);
    }
  });

  it("does not take a membership of another user from the session", async () => {
    const forged = { userId: "usr_manager", membershipId: "mem_admin" };
    const board = (await rpc("dashboard", null, forged)).body as { scope: string; canCreateObject: boolean; objects: { id: string }[] };
    assert.equal(board.scope, "OBJECT", "falls back to the user's own membership");
    assert.equal(board.canCreateObject, false);
    assert.deepEqual(
      board.objects.map((object) => object.id),
      ["obj_siyanie"],
    );
    assert.equal((await rpc("team", null, forged)).status, 403);
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: [] }, forged)).status, 403);
    const household = { userId: "usr_manager", membershipId: "mem_stanislav_24" };
    assert.equal((await rpc("openGate", null, household)).status, 403);
  });
});

describe("request origin", () => {
  it("rejects cross-site writes and keeps same-origin ones", async () => {
    const { crossSiteWrite } = await import("../../web/src/server/same-origin");
    const headers = (values: Record<string, string>) => new Headers({ host: "star.example", ...values });
    assert.equal(crossSiteWrite("POST", headers({ origin: "https://evil.example" })), true);
    assert.equal(crossSiteWrite("DELETE", headers({ "sec-fetch-site": "cross-site" })), true);
    assert.equal(crossSiteWrite("PATCH", headers({ "sec-fetch-site": "same-site" })), true);
    assert.equal(crossSiteWrite("POST", headers({ origin: "null" })), true);
    assert.equal(crossSiteWrite("POST", headers({ origin: "https://star.example", "sec-fetch-site": "same-origin" })), false);
    assert.equal(crossSiteWrite("POST", headers({})), false);
    assert.equal(crossSiteWrite("GET", headers({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })), false);
  });
});

describe("internal channel", () => {
  it("accepts only fresh signed calls", async () => {
    const { freshRpc } = await import("../../web/src/server/internal-secret");
    const now = Date.now();
    assert.equal(freshRpc(now, now), true);
    assert.equal(freshRpc(now - 59_000, now), true);
    assert.equal(freshRpc(now - 61_000, now), false);
    assert.equal(freshRpc(now + 61_000, now), false);
    assert.equal(freshRpc(undefined, now), false);
    assert.equal(freshRpc("1", now), false);
  });

  it("requires the internal secret in production", async () => {
    const { internalSecret } = await import("../../web/src/server/internal-secret");
    const env = process.env as Record<string, string | undefined>;
    const saved = { node: env.NODE_ENV, secret: env.STAR_HOME_INTERNAL_SECRET };
    env.NODE_ENV = "production";
    delete env.STAR_HOME_INTERNAL_SECRET;
    assert.throws(() => internalSecret());
    env.STAR_HOME_INTERNAL_SECRET = "configured";
    assert.equal(internalSecret(), "configured");
    env.NODE_ENV = saved.node;
    if (saved.secret === undefined) delete env.STAR_HOME_INTERNAL_SECRET;
    else env.STAR_HOME_INTERNAL_SECRET = saved.secret;
  });
});

describe("security desk", () => {
  it("stores the object security phone in the snapshot", async () => {
    const saved = await rpc("updateObject", { objectId: "obj_siyanie", name: "КП Сияние", address: "Московская область", securityPhone: "+79991234567" }, staff.COMPANY_ADMIN ?? null);
    assert.equal(saved.status, 200);
    const tree = await rpc("tree", { objectId: "obj_siyanie" }, staff.COMPANY_ADMIN ?? null);
    assert.equal(tree.status, 200);
    assert.equal((tree.body as { object: { securityPhone?: string } }).object.securityPhone, "+79991234567");
    const desk = await rpc("securityDesk", {}, resident);
    assert.equal(desk.status, 200);
    assert.equal((desk.body as { phone: string | null; canCall: boolean }).phone, "+79991234567");
    assert.equal((desk.body as { canCall: boolean }).canCall, true);
  });

  it("lets a resident write and raise SOS, then shows it on the post", async () => {
    const chat = await rpc("sendSecurityMessage", { body: "Нужна помощь у калитки" }, resident);
    assert.equal(chat.status, 200);
    const sos = await rpc("raiseSos", {}, resident);
    assert.equal(sos.status, 200);
    const post = await rpc("securityPost", { objectId: "obj_siyanie" }, staff.SECURITY ?? null);
    assert.equal(post.status, 200);
    const view = post.body as { alarms: { kind: string; title: string; callerName: string | null }[]; chats: { body: string }[] };
    assert.ok(view.alarms.some((alarm) => alarm.kind === "SOS" && alarm.title.includes("SOS") && alarm.callerName));
    assert.ok(view.chats.some((message) => message.body === "Нужна помощь у калитки"));
    const reply = await rpc("sendSecurityReply", { objectId: "obj_siyanie", unitId: "unit_24", body: "Выходим" }, staff.SECURITY ?? null);
    assert.equal(reply.status, 200);
    const desk = await rpc("securityDesk", {}, resident);
    assert.ok((desk.body as { messages: { body: string }[] }).messages.some((message) => message.body === "Выходим"));
  });

  it("closes SOS and chat to a guest", async () => {
    const people = await import("../../web/src/server/people-store");
    const visitor = people.createPerson({ login: "desk.guest", name: "Гость поста", passwordHash: "x" });
    const guest = people.createResidentMembership({
      userId: visitor.id,
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
      role: "GUEST",
      expiresAt: "2999-01-01T00:00:00",
    });
    const session = { userId: visitor.id, membershipId: guest.id };
    const before = state();
    assert.equal((await rpc("raiseSos", {}, session)).status, 403);
    assert.equal((await rpc("sendSecurityMessage", { body: "Привет" }, session)).status, 403);
    assert.equal(state(), before);
  });
});

describe("audit flood", () => {
  it("caps refusal records per user and method", async () => {
    const audit = await import("../../web/src/server/audit-store");
    const count = () => audit.listAudit().filter((entry) => entry.actorUserId === "usr_manager" && entry.action === "ROLES_EDIT" && entry.result === "DENIED").length;
    const before = count();
    for (let index = 0; index < 30; index += 1) {
      assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: [] }, staff.MANAGER ?? null)).status, 403);
    }
    assert.ok(count() - before <= 10, `wrote ${count() - before}`);
    assert.ok(count() - before >= 1);
  });
});
