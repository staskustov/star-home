import "./register-paths";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";

type Reply = { status: number; body: unknown };
type Rpc = (
  method: string,
  input: unknown,
  session: { userId: string; membershipId: string | null; sv?: number } | null,
  client?: { ip: string | null; device: string | null },
) => Promise<Reply>;

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
    assert.deepEqual(Object.keys(body.objects[0] ?? {}).sort(), ["address", "buildings", "canDelete", "companyId", "id", "name", "securityPhone", "type", "units"]);
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
    assert.ok(permissionsOf("COMPANY_ADMIN").has("residents.edit"));
    assert.ok(permissionsOf("COMPANY_ADMIN").has("residents.delete"));
    assert.ok(permissionsOf("OBJECT_ADMIN").has("residents.edit"));
    assert.ok(permissionsOf("OBJECT_ADMIN").has("residents.delete"));
    assert.ok(permissionsOf("COMPANY_ADMIN").has("access.points.manage"));
    assert.ok(permissionsOf("OBJECT_ADMIN").has("access.points.manage"));
    assert.ok(!permissionsOf("MANAGER").has("access.points.manage"));
    assert.ok(permissionsOf("COMPANY_ADMIN").has("devices.create"));
    assert.ok(permissionsOf("OBJECT_ADMIN").has("devices.create"));
    assert.ok(!permissionsOf("MANAGER").has("devices.create"));
  });
});

describe("residents", () => {
  it("lets company and object admins edit and remove people in their objects", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "edit.resident.test", name: "Черновик", passwordHash: "x" });
    const membership = people.createResidentMembership({
      userId: person.id,
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
    });
    const board = (await rpc("residents", null, objectAdmin)).body as {
      can: { edit: boolean; remove: boolean };
      people: { membershipId: string; name: string }[];
    };
    assert.equal(board.can.edit, true);
    assert.equal(board.can.remove, true);
    assert.ok(board.people.some((row) => row.membershipId === membership.id));
    const saved = await rpc(
      "updateResident",
      { membershipId: membership.id, name: "Новое имя", login: "edit.resident.test", unitId: "unit_24", role: "FAMILY_MEMBER" },
      objectAdmin,
    );
    assert.equal(saved.status, 200);
    assert.equal(people.listUsers().find((user) => user.id === person.id)?.name, "Новое имя");
    assert.equal(people.listMemberships().find((item) => item.id === membership.id)?.role, "FAMILY_MEMBER");
    assert.equal(
      (await rpc("updateResident", { membershipId: membership.id, name: "Чужой", login: "edit.resident.test", unitId: "unit_84", role: "RESIDENT" }, objectAdmin))
        .status,
      403,
    );
    assert.equal((await rpc("updateResident", { membershipId: "mem_missing", name: "Нет", login: "nobody.test", unitId: "unit_24" }, admin)).status, 404);
    assert.equal(
      (await rpc("updateResident", { membershipId: membership.id, name: "Новое имя", login: "edit.resident.test", unitId: "unit_24" }, security)).status,
      403,
    );
    const company = await rpc("updateResident", { membershipId: membership.id, name: "Админ правил", login: "edit.resident.test", unitId: "unit_siyanie_1", role: "RESIDENT" }, admin);
    assert.equal(company.status, 200);
    assert.equal((await rpc("removeResident", { membershipId: membership.id }, objectAdmin)).status, 200);
    assert.equal(people.listMemberships().some((item) => item.id === membership.id), false);
  });
});

describe("access points", () => {
  it("lets company and object admins add a point, open, close and see status", async () => {
    const created = await rpc("createAccessPoint", { objectId: "obj_siyanie", name: "Калитка теста", api: "" }, objectAdmin);
    assert.equal(created.status, 201);
    const pointId = (created.body as { id: string }).id;
    const desk = (await rpc("desk", { section: "access" }, objectAdmin)).body as {
      points: { id: string; name: string; status: string; latch: string }[];
    };
    const row = desk.points.find((point) => point.id === pointId);
    assert.ok(row);
    assert.equal(row.status, "Закрыто");
    assert.equal((await rpc("createAccessPoint", { objectId: "obj_siyanie", name: "Чужая", api: "" }, manager)).status, 403);
    assert.equal((await rpc("createAccessPoint", { objectId: "obj_park", name: "Чужая", api: "" }, objectAdmin)).status, 403);
    const opened = await rpc("openObjectPoint", { objectId: "obj_siyanie", pointId }, objectAdmin);
    assert.equal(opened.status, 200);
    const afterOpen = (await rpc("desk", { section: "access" }, objectAdmin)).body as { points: { id: string; status: string }[] };
    assert.equal(afterOpen.points.find((point) => point.id === pointId)?.status, "Открыто");
    const closed = await rpc("closeObjectPoint", { objectId: "obj_siyanie", pointId }, objectAdmin);
    assert.equal(closed.status, 200);
    const afterClose = (await rpc("desk", { section: "access" }, objectAdmin)).body as { points: { id: string; status: string }[] };
    assert.equal(afterClose.points.find((point) => point.id === pointId)?.status, "Закрыто");
    const renamed = await rpc("updateAccessPoint", { objectId: "obj_siyanie", pointId, name: "Калитка двора", api: "" }, admin);
    assert.equal(renamed.status, 200);
    assert.equal((await rpc("removeAccessPoint", { objectId: "obj_siyanie", pointId }, objectAdmin)).status, 200);
  });
});

describe("smart home registry", () => {
  it("stores rooms, gateways and device bindings inside object scope", async () => {
    const room = await rpc("createRoom", { unitId: "unit_24", name: "Кабинет", kind: "STUDY", floor: 1 }, objectAdmin);
    assert.equal(room.status, 201);
    const roomId = (room.body as { id: string }).id;
    const details = (await rpc("unitDetails", { unitId: "unit_24" }, objectAdmin)).body as {
      rooms: { id: string; name: string; kind: string; floor: number | null }[];
    };
    assert.ok(details.rooms.some((item) => item.id === roomId && item.name === "Кабинет"));
    assert.equal((await rpc("createRoom", { unitId: "unit_84", name: "Чужая" }, objectAdmin)).status, 403);
    assert.equal((await rpc("createRoom", { unitId: "unit_24", name: "Чужая" }, security)).status, 403);

    const gateway = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB Local Gateway", adapter: "wirenboard" }, objectAdmin);
    assert.equal(gateway.status, 201);
    const gatewayId = (gateway.body as { id: string }).id;
    assert.equal((await rpc("createGateway", { objectId: "obj_park", name: "Чужой" }, objectAdmin)).status, 403);
    assert.equal((await rpc("createGateway", { objectId: "obj_siyanie", name: "Чужой" }, manager)).status, 403);
    const listed = (await rpc("listGateways", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      gateways: { id: string; status: string; adapter: string; connectedDevices: number }[];
    };
    const row = listed.gateways.find((item) => item.id === gatewayId);
    assert.ok(row);
    assert.equal(row.status, "OFFLINE");
    assert.equal(row.adapter, "wirenboard");

    const created = await rpc(
      "registerDevice",
      { objectId: "obj_siyanie", unitId: "unit_24", roomId, gatewayId, name: "Свет в кабинете", kind: "LIGHTING" },
      objectAdmin,
    );
    assert.equal(created.status, 201);
    const deviceId = (created.body as { id: string }).id;
    assert.equal((await rpc("registerDevice", { objectId: "obj_park", name: "Чужой", kind: "LIGHTING" }, objectAdmin)).status, 403);
    const devices = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      devices: { id: string; roomId: string | null; gatewayId: string | null; capabilities: string[]; availability: string }[];
    };
    const device = devices.devices.find((item) => item.id === deviceId);
    assert.ok(device);
    assert.equal(device.roomId, roomId);
    assert.equal(device.gatewayId, gatewayId);
    assert.deepEqual(device.capabilities, ["power", "brightness"]);
    assert.equal(device.availability, "UNKNOWN");
    const climate = devices.devices.find((item) => item.id === "dev_climate_24");
    assert.ok(climate);
    assert.ok(climate.capabilities.includes("temperature"));

    assert.equal((await rpc("removeRoom", { roomId }, objectAdmin)).status, 409);
    assert.equal((await rpc("removeGateway", { gatewayId }, objectAdmin)).status, 409);
    assert.equal((await rpc("removeDevice", { deviceId }, objectAdmin)).status, 200);
    assert.equal((await rpc("removeRoom", { roomId }, objectAdmin)).status, 200);
    assert.equal((await rpc("removeGateway", { gatewayId }, objectAdmin)).status, 200);
    const after = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as { devices: { id: string }[] };
    assert.ok(!after.devices.some((item) => item.id === deviceId));
  });
});

describe("smart home commands", () => {
  it("lets a resident command a low-risk device on their unit", async () => {
    const reply = await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const body = reply.body as { confirmed: boolean; device?: { state?: { on?: boolean } } };
    assert.equal(body.confirmed, true);
    assert.equal(body.device?.state?.on, true);
  });

  it("keeps HIGH commands behind confirm and audit", async () => {
    const first = await rpc("commandDeviceSmart", { deviceId: "dev_gate_siyanie", command: "open" }, resident);
    assert.equal(first.status, 200);
    const pending = first.body as { needsConfirm?: boolean; token?: string; confirmed: boolean };
    assert.equal(pending.confirmed, false);
    assert.equal(pending.needsConfirm, true);
    assert.ok(pending.token);
    const opened = await rpc("commandDeviceSmart", { deviceId: "dev_gate_siyanie", command: "open", confirmToken: pending.token }, resident);
    assert.equal(opened.status, 200);
    assert.equal((opened.body as { confirmed: boolean }).confirmed, true);
  });

  it("rejects an unknown capability and a neighbour device", async () => {
    assert.equal((await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setTemperature", value: 21 }, resident)).status, 400);
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "park.smart.resident", name: "Мария", passwordHash: "x" });
    const membership = people.createResidentMembership({
      userId: person.id,
      companyId: "cmp_star",
      objectId: "obj_park",
      unitId: "unit_84",
    });
    const other = { userId: person.id, membershipId: membership.id };
    const reply = await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, other);
    assert.ok(reply.status === 403 || reply.status === 404, JSON.stringify(reply.body));
  });

  it("reads catalog rooms and hides protocol fields from the resident", async () => {
    const home = (await rpc("home", null, resident)).body as { home: { rooms: { name: string }[] } };
    assert.ok(home.home.rooms.some((room) => room.name === "Гостиная"));
    assert.ok(!home.home.rooms.some((room) => room.name === "Детская"));
    const devices = (await rpc("smartHomeDevices", {}, resident)).body as {
      devices: { id: string; technical?: unknown; endpoint?: string }[];
    };
    const light = devices.devices.find((item) => item.id === "dev_light_24");
    assert.ok(light);
    assert.equal(light.technical, undefined);
    assert.equal(JSON.stringify(light).includes("endpoint"), false);
  });

  it("runs a life-mode scenario without executing HIGH steps", async () => {
    const created = await rpc(
      "createScenario",
      {
        objectId: "obj_siyanie",
        unitId: "unit_24",
        name: "Ушёл на работу",
        trigger: "LIFE_MODE",
        lifeMode: "WORK",
        steps: [
          { deviceId: "dev_light_24", command: "setPower", value: false },
          { deviceId: "dev_gate_siyanie", command: "open" },
        ],
      },
      resident,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const close = await rpc("commandDeviceSmart", { deviceId: "dev_gate_siyanie", command: "close" }, resident);
    const closeToken = (close.body as { token?: string }).token;
    if (closeToken) await rpc("commandDeviceSmart", { deviceId: "dev_gate_siyanie", command: "close", confirmToken: closeToken }, resident);
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    const switched = await rpc("switchMode", { mode: "WORK" }, resident);
    assert.equal(switched.status, 200);
    const device = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, resident)).body as { device: { state?: { on?: boolean } } };
    assert.equal(device.device.state?.on, false);
    const gate = (await rpc("smartHomeDevice", { deviceId: "dev_gate_siyanie" }, resident)).body as { device: { state?: { latch?: string } } };
    assert.notEqual(gate.device.state?.latch, "OPEN");
  });

  it("does not let AI open a gate without confirm", async () => {
    const before = (await rpc("smartHomeDevice", { deviceId: "dev_gate_siyanie" }, resident)).body as { device: { state?: { latch?: string } } };
    const asked = await rpc("ask", { prompt: "открой ворота" }, resident);
    assert.equal(asked.status, 200);
    const token = (asked.body as { confirmToken: string | null }).confirmToken;
    assert.ok(token);
    const after = (await rpc("smartHomeDevice", { deviceId: "dev_gate_siyanie" }, resident)).body as { device: { state?: { latch?: string } } };
    assert.equal(after.device.state?.latch, before.device.state?.latch);
    const confirmed = await rpc("confirm", { token }, resident);
    assert.equal(confirmed.status, 200);
  });

  it("shows home facts from stored device state", async () => {
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    const home = (await rpc("home", null, resident)).body as { home: { facts?: { lights?: { on: number; total: number } | null }; quickActions: { id: string }[] } };
    assert.ok(home.home.facts?.lights);
    assert.ok((home.home.facts.lights.on ?? 0) >= 1);
    assert.ok(home.home.quickActions.some((action) => action.id === "night"));
    assert.ok(home.home.quickActions.some((action) => action.id === "lights-off"));
  });

  it("runs lights-off and keeps the night scenario", async () => {
    const list = (await rpc("listScenarios", {}, resident)).body as { scenarios: { name: string }[] };
    assert.ok(list.scenarios.some((scenario) => scenario.name === "Ночь"));
    const action = await rpc("runHomeAction", { action: "lights-off" }, resident);
    assert.equal(action.status, 200, JSON.stringify(action.body));
    assert.equal((action.body as { confirmed: boolean }).confirmed, true);
    const device = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, resident)).body as { device: { state?: { on?: boolean } } };
    assert.equal(device.device.state?.on, false);
  });

  it("places a pin on an uploaded plan and hides it from the resident editor", async () => {
    const plan = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    assert.equal((await rpc("updateUnit", { unitId: "unit_24", name: "Дом №24", floors: 1, plans: [{ floor: 1, image: plan }] }, objectAdmin)).status, 200);
    assert.equal((await rpc("placeDevice", { deviceId: "dev_light_24", planFloor: 1, planX: 40, planY: 60 }, resident)).status, 403);
    assert.equal((await rpc("placeDevice", { deviceId: "dev_light_24", planFloor: 1, planX: 40, planY: 60 }, objectAdmin)).status, 200);
    const floors = ((await rpc("floorPlan", {}, resident)).body as { floors: { pins: { deviceId: string; x: number }[] }[] }).floors;
    assert.ok(floors.some((floor) => floor.pins.some((pin) => pin.deviceId === "dev_light_24" && pin.x === 40)));
  });

  it("runs EVENT steps except HIGH", async () => {
    const created = await rpc(
      "createScenario",
      {
        name: "Свет погас",
        trigger: "EVENT",
        conditions: [{ deviceId: "dev_light_24", field: "on", value: false }],
        steps: [
          { deviceId: "dev_curtain_24", command: "setPosition", value: 0 },
          { deviceId: "dev_gate_siyanie", command: "open" },
        ],
      },
      resident,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await rpc("commandDeviceSmart", { deviceId: "dev_curtain_24", command: "setPosition", value: 80 }, resident);
    const close = await rpc("commandDeviceSmart", { deviceId: "dev_gate_siyanie", command: "close" }, resident);
    const closeToken = (close.body as { token?: string }).token;
    if (closeToken) await rpc("commandDeviceSmart", { deviceId: "dev_gate_siyanie", command: "close", confirmToken: closeToken }, resident);
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, resident);
    const curtain = (await rpc("smartHomeDevice", { deviceId: "dev_curtain_24" }, resident)).body as { device: { state?: { position?: number } } };
    assert.equal(curtain.device.state?.position, 0);
    const gate = (await rpc("smartHomeDevice", { deviceId: "dev_gate_siyanie" }, resident)).body as { device: { state?: { latch?: string } } };
    assert.notEqual(gate.device.state?.latch, "OPEN");
  });

  it("runs a due schedule once per calendar day", async () => {
    const timeZone = "Europe/Moscow";
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
    const minute = Number(new Intl.DateTimeFormat("en-GB", { minute: "2-digit", timeZone }).format(now));
    const created = await rpc(
      "createScenario",
      {
        name: "По времени",
        trigger: "SCHEDULE",
        scheduleHour: hour,
        scheduleMinute: minute,
        steps: [{ deviceId: "dev_light_24", command: "setPower", value: true }],
      },
      resident,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, resident);
    assert.equal((await rpc("smartHomeStatus", {}, resident)).status, 200);
    const first = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, resident)).body as { device: { state?: { on?: boolean } } };
    assert.equal(first.device.state?.on, true);
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, resident);
    assert.equal((await rpc("smartHomeStatus", {}, resident)).status, 200);
    const second = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, resident)).body as { device: { state?: { on?: boolean } } };
    assert.equal(second.device.state?.on, false);
  });

  it("issues a pairing token once and never stores the plaintext", async () => {
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "Канал теста", adapter: "local" }, admin);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const gatewayId = (created.body as { id: string }).id;
    const paired = await rpc("pairGateway", { gatewayId }, admin);
    assert.equal(paired.status, 200, JSON.stringify(paired.body));
    const token = (paired.body as { token: string }).token;
    assert.match(token, /^[a-f0-9]{48}$/);
    const desk = JSON.stringify((await rpc("desk", { section: "devices" }, admin)).body);
    assert.ok(!desk.includes(token));
    assert.equal((await rpc("pairGateway", { gatewayId }, resident)).status, 403);
  });

  it("shows room cards from stored device state", async () => {
    const rooms = (await rpc("smartHomeRooms", {}, resident)).body as {
      rooms: { id: string; name: string; temperatureC: number | null; lights: { on: number; total: number } | null }[];
    };
    const living = rooms.rooms.find((room) => room.name === "Гостиная");
    assert.ok(living);
    assert.equal(living.temperatureC, 22.4);
    const room = await rpc("smartHomeRoomDevices", { roomId: living.id }, resident);
    assert.equal(room.status, 200);
    assert.ok(((room.body as { devices: { id: string }[] }).devices).some((device) => device.id === "dev_light_24"));
  });

  it("edits EVENT and SCHEDULE scenarios and can disable them", async () => {
    const created = await rpc(
      "createScenario",
      {
        name: "Вечер",
        trigger: "SCHEDULE",
        scheduleHour: 21,
        scheduleMinute: 30,
        steps: [{ deviceId: "dev_light_24", command: "setPower", value: false }],
      },
      resident,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = (created.body as { id: string }).id;
    const updated = await rpc("updateScenario", { scenarioId: id, enabled: false, trigger: "EVENT", conditions: [{ deviceId: "dev_light_24", field: "on", value: false }] }, resident);
    assert.equal(updated.status, 200);
    const list = (await rpc("listScenarios", {}, resident)).body as { scenarios: { id: string; enabled: boolean; trigger: string }[] };
    const row = list.scenarios.find((item) => item.id === id);
    assert.equal(row?.enabled, false);
    assert.equal(row?.trigger, "EVENT");
  });

  it("queues a remote command and acks it once", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "queue.resident", name: "Очередь", passwordHash: "x" });
    const membership = people.createResidentMembership({ userId: person.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24" });
    const actor = { userId: person.id, membershipId: membership.id };
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "Очередь", adapter: "wirenboard" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const bound = await rpc("updateDevice", { deviceId: "dev_light_24", gatewayId }, admin);
    assert.equal(bound.status, 200, JSON.stringify(bound.body));
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const gateway = file.gateways.find((item) => item.id === gatewayId);
    assert.ok(gateway);
    gateway.status = "OFFLINE";
    ops.writeOps(file);
    const sent = await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, actor);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const commandId = (sent.body as { commandId?: string; status?: string }).commandId;
    assert.ok(commandId);
    assert.equal((sent.body as { status?: string }).status, "QUEUED");
    const paired = await rpc("pairGateway", { gatewayId }, admin);
    const token = (paired.body as { token: string }).token;
    const channel = await import("../../web/src/server/gateway-channel");
    const pulled = channel.pullGateway(token);
    assert.equal(pulled.ok, true);
    if (pulled.ok) assert.ok(pulled.value.commands.some((item) => item.id === commandId));
    const first = channel.ackGateway(token, { commandId, confirmed: true, state: { on: true } });
    const second = channel.ackGateway(token, { commandId, confirmed: true, state: { on: false } });
    assert.equal(first.ok && first.value.applied, true);
    assert.equal(second.ok && second.value.applied, false);
    const device = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, resident)).body as { device: { state?: { on?: boolean } } };
    assert.equal(device.device.state?.on, true);
    await rpc("updateDevice", { deviceId: "dev_light_24", gatewayId: null }, admin);
  });

  it("rotates and revokes a gateway token", async () => {
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "Ротация", adapter: "local" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const first = await rpc("pairGateway", { gatewayId }, admin);
    const oldToken = (first.body as { token: string }).token;
    const rotated = await rpc("rotateGateway", { gatewayId }, admin);
    assert.equal(rotated.status, 200);
    const next = (rotated.body as { token: string }).token;
    assert.notEqual(next, oldToken);
    const channel = await import("../../web/src/server/gateway-channel");
    assert.equal(channel.heartbeatGateway(oldToken, {}).ok, false);
    assert.equal(channel.heartbeatGateway(next, {}).ok, true);
    assert.equal((await rpc("revokeGateway", { gatewayId }, admin)).status, 200);
    assert.equal(channel.heartbeatGateway(next, {}).ok, false);
  });

  it("writes a household notice only when a sensor raises", async () => {
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "Датчик", adapter: "local" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    await rpc("updateDevice", { deviceId: "dev_light_24", gatewayId }, admin);
    const paired = await rpc("pairGateway", { gatewayId }, admin);
    const token = (paired.body as { token: string }).token;
    const channel = await import("../../web/src/server/gateway-channel");
    const before = ((await rpc("home", null, resident)).body as { home: { notices?: { body: string }[] } }).home.notices ?? [];
    channel.ingestGatewayState(token, { deviceId: "dev_light_24", state: { detected: true } });
    const after = ((await rpc("home", null, resident)).body as { home: { notices?: { body: string }[] } }).home.notices ?? [];
    assert.ok(after.length >= before.length);
    assert.ok(after.some((item) => item.body.includes("сигнал")));
    await rpc("updateDevice", { deviceId: "dev_light_24", gatewayId: null }, admin);
  });

  it("filters history by since and does not invent points", async () => {
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, resident);
    const all = (await rpc("smartHomeHistory", { deviceId: "dev_light_24" }, resident)).body as { points: { at: string }[] };
    assert.ok(all.points.length >= 1);
    const future = await rpc("smartHomeHistory", { deviceId: "dev_light_24", since: "2999-01-01T00:00:00.000Z" }, resident);
    assert.equal(future.status, 200);
    assert.equal(((future.body as { points: unknown[] }).points).length, 0);
  });

  it("writes a command log and hides it from the resident", async () => {
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    const staffLog = await rpc("smartHomeCommandLog", { objectId: "obj_siyanie" }, objectAdmin);
    assert.equal(staffLog.status, 200);
    const rows = (staffLog.body as { commands: { deviceId: string; result: string }[] }).commands;
    assert.ok(rows.some((row) => row.deviceId === "dev_light_24" && row.result === "SUCCESS"));
    assert.equal((await rpc("smartHomeCommandLog", { objectId: "obj_siyanie" }, resident)).status, 403);
  });

  it("pins a favorite for the resident and rejects a guest", async () => {
    const pinned = await rpc("setDeviceFavorite", { deviceId: "dev_light_24", favorite: true }, resident);
    assert.equal(pinned.status, 200, JSON.stringify(pinned.body));
    const home = (await rpc("home", null, resident)).body as { home: { devices: { id?: string; favorite?: boolean }[] } };
    assert.equal(home.home.devices.find((device) => device.id === "dev_light_24")?.favorite, true);
    assert.equal((await rpc("setDeviceFavorite", { deviceId: "dev_light_24", favorite: true }, objectAdmin)).status, 403);
  });

  it("shows energy only from real watts and keeps rooms from the catalog", async () => {
    const before = ((await rpc("home", null, resident)).body as { home: { facts?: { energy: { watts?: number } | null } } }).home.facts;
    assert.equal(before?.energy ?? null, null);
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const light = file.devices.find((item) => item.id === "dev_light_24");
    if (light) light.state = { ...light.state, watts: 42 };
    ops.writeOps(file);
    const after = ((await rpc("home", null, resident)).body as { home: { facts?: { energy?: { watts?: number } | null } } }).home.facts;
    assert.equal(after?.energy?.watts, 42);
    const asked = await rpc("ask", { prompt: "какие комнаты" }, resident);
    assert.equal(asked.status, 200);
    assert.match((asked.body as { reply: string }).reply, /Гостиная|Спальня/);
    if (light) {
      delete light.state?.watts;
      ops.writeOps(file);
    }
  });

  it("saves a scenario description and lists event severity", async () => {
    const created = await rpc(
      "createScenario",
      { name: "Тихий вечер", description: "Только свет", trigger: "MANUAL", steps: [{ deviceId: "dev_light_24", command: "setPower", value: false }] },
      resident,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const list = (await rpc("listScenarios", {}, resident)).body as { scenarios: { name: string; description?: string }[] };
    assert.ok(list.scenarios.some((scenario) => scenario.name === "Тихий вечер" && scenario.description === "Только свет"));
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, resident);
    const events = (await rpc("smartHomeEvents", {}, resident)).body as { events: { severity?: string; source?: string }[] };
    assert.ok(events.events.some((event) => event.severity && event.source));
  });

  it("asks AI to run a scenario only after confirm", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "ai.scenario", name: "Сценарий", passwordHash: "x" });
    const membership = people.createResidentMembership({ userId: person.id, companyId: "cmp_star", objectId: "obj_siyanie", unitId: "unit_24" });
    const actor = { userId: person.id, membershipId: membership.id };
    await rpc("updateDevice", { deviceId: "dev_light_24", gatewayId: null }, objectAdmin);
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, actor);
    const created = await rpc(
      "createScenario",
      { name: "AI прогон", trigger: "MANUAL", steps: [{ deviceId: "dev_light_24", command: "setPower", value: false }] },
      actor,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const asked = await rpc("ask", { prompt: "запусти сценарий AI прогон" }, actor);
    assert.equal(asked.status, 200);
    const token = (asked.body as { confirmToken: string | null }).confirmToken;
    assert.ok(token);
    const mid = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, actor)).body as { device: { state?: { on?: boolean } } };
    assert.equal(mid.device.state?.on, true);
    const confirmed = await rpc("confirm", { token }, actor);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.match((confirmed.body as { reply: string }).reply, /выполнен|Готово/);
    const after = (await rpc("smartHomeDevice", { deviceId: "dev_light_24" }, actor)).body as { device: { state?: { on?: boolean } } };
    assert.equal(after.device.state?.on, false);
  });
});

describe("houses", () => {
  it("stores area, floors and plans on a unit", async () => {
    const plan = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const saved = await rpc(
      "updateUnit",
      { unitId: "unit_24", name: "Дом №24", areaM2: 186.5, floors: 2, plans: [{ floor: 1, image: plan }, { floor: 2, image: plan }] },
      objectAdmin,
    );
    assert.equal(saved.status, 200);
    const details = await rpc("unitDetails", { unitId: "unit_24" }, objectAdmin);
    assert.equal(details.status, 200);
    const body = details.body as { areaM2: number; floors: number; plans: { floor: number }[] };
    assert.equal(body.areaM2, 186.5);
    assert.equal(body.floors, 2);
    assert.equal(body.plans.length, 2);
    const tree = (await rpc("tree", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      units: { id: string; areaM2: number | null; floors: number; planFloors: number[] }[];
    };
    const house = tree.units.find((unit) => unit.id === "unit_24");
    assert.equal(house?.areaM2, 186.5);
    assert.equal(house?.floors, 2);
    assert.deepEqual(house?.planFloors, [1, 2]);
    assert.equal(JSON.stringify(tree).includes("data:image"), false);
    const person = (await import("../../web/src/server/people-store")).createPerson({
      login: "surname.resident.test",
      name: "Иван",
      surname: "Петров",
      passwordHash: "x",
    });
    const membership = (await import("../../web/src/server/people-store")).createResidentMembership({
      userId: person.id,
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
    });
    const board = (await rpc("residents", null, objectAdmin)).body as { people: { membershipId: string; surname: string; displayName: string }[] };
    const row = board.people.find((item) => item.membershipId === membership.id);
    assert.equal(row?.surname, "Петров");
    assert.equal(row?.displayName, "Иван Петров");
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
    assert.equal((await rpc("updateResident", { membershipId: "mem_stanislav_24", name: "Нет", login: "stanislav", unitId: "unit_24" }, accountant)).status, 403);
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
    assert.ok(guard.includes("/security") && !guard.includes("/admin/payments"));
    assert.ok(books.includes("/admin/payments") && !books.includes("/security"));
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

describe("audit log", () => {
  type Row = { id: string; action: string; result: string; role: string | null; ip: string | null; device: string | null; place: string; changes: { field: string }[] };
  type Board = { entries: Row[]; total: number; canExport: boolean; options: { categories: { value: string }[] } };
  const office = { ip: "203.0.113.7", device: "Chrome · macOS" };
  const store = () => import("../../web/src/server/audit-store");
  const latest = async (action: string) => (await store()).listAudit().find((entry) => entry.action === action);

  it("moves the old records in once and keeps them", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const old = { id: "aud_legacy_test", actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_siyanie", action: "OPEN_GATE", target: "Старая запись", result: "SUCCESS" as const, error: "", at: "24.09 10:00" };
    ops.writeOps({ ...file, audit: [...file.audit, old] });
    memory.delete("audit");
    delete (globalThis as { __starHomeAudit?: unknown }).__starHomeAudit;
    const audit = await store();
    assert.equal(audit.listAudit().filter((entry) => entry.id === old.id).length, 1);
    const legacy = audit.listAudit().filter((entry) => entry.targetType === "legacy");
    assert.ok(legacy.length > 0);
    assert.ok(legacy.every((entry) => !Number.isNaN(Date.parse(entry.at))));
    assert.equal(legacy.find((entry) => entry.id === old.id)?.category, "ACCESS");
    assert.ok(ops.readOps().audit.every((entry) => audit.listAudit().some((record) => record.id === entry.id)));
  });

  it("writes who, role, place, ip and device for critical actions", async () => {
    assert.equal((await rpc("openObjectGate", { objectId: "obj_siyanie" }, admin, office)).status, 200);
    const gate = await latest("OPEN_GATE");
    assert.equal(gate?.actorUserId, "usr_admin");
    assert.equal(gate?.actorRole, "COMPANY_ADMIN");
    assert.equal(gate?.membershipId, "mem_admin");
    assert.equal(gate?.objectId, "obj_siyanie");
    assert.equal(gate?.category, "ACCESS");
    assert.equal(gate?.ip, office.ip);
    assert.equal(gate?.device, office.device);

    const created = await rpc("createBuilding", { objectId: "obj_park", name: "Корпус аудита" }, admin, office);
    assert.equal(created.status, 201);
    const buildingId = (created.body as { id: string }).id;
    assert.equal((await latest("BUILDING_CREATE"))?.targetId, buildingId);
    assert.equal((await rpc("removeBuilding", { buildingId }, admin, office)).status, 200);
    assert.equal((await latest("BUILDING_DELETE"))?.category, "DATA");

    const settings = (await rpc("settings", null, admin)).body as { objects: { objectId: string; modes: { mode: string; label: string; summary: string; detail: string; climate: string; lighting: string; security: string; notifications: string; checks: string[] }[] }[] };
    const mode = settings.objects.find((object) => object.objectId === "obj_siyanie")?.modes[0];
    assert.ok(mode);
    assert.equal((await rpc("saveMode", { objectId: "obj_siyanie", setting: { ...mode, summary: `${mode.summary} ·` } }, admin, office)).status, 200);
    const saved = await latest("MODE_SETTINGS");
    assert.equal(saved?.category, "SETTINGS");
    assert.deepEqual(saved?.changes?.map((change) => change.field), ["Статус"]);
    assert.equal((await rpc("saveMode", { objectId: "obj_siyanie", setting: mode }, admin, office)).status, 200);

    assert.equal((await rpc("switchMode", { mode: "HOME" }, resident, office)).status, 200);
    const switched = await latest("MODE_SWITCH");
    assert.equal(switched?.unitId, "unit_24");
    assert.equal(switched?.actorRole, "RESIDENT");
  });

  it("writes refusals on guarded methods without trusting foreign ids", async () => {
    assert.equal((await rpc("rolesSave", { role: "MANAGER", permissions: [] }, manager, office)).status, 403);
    const denied = await latest("ROLES_EDIT");
    assert.equal(denied?.result, "DENIED");
    assert.equal(denied?.actorUserId, "usr_manager");
    assert.equal(denied?.companyId, "cmp_star");
    assert.equal(denied?.objectId, "obj_siyanie", "a refusal lands on the actor's own object");
    assert.equal(denied?.ip, office.ip);
    assert.equal((await rpc("removeObject", { objectId: "obj_park" }, objectAdmin, office)).status, 403);
    assert.equal((await latest("OBJECT_DELETE"))?.result, "DENIED");
  });

  it("records sign-ins and failed attempts for known users only", async () => {
    const audit = await store();
    const before = audit.listAudit().length;
    assert.equal((await rpc("login", { login: "nobody.here", password: "wrong" }, null, office)).status, 401);
    assert.equal(audit.listAudit().length, before);
    assert.equal((await rpc("login", { login: "manager", password: "wrong-password" }, null, office)).status, 401);
    const failed = await latest("LOGIN_FAILED");
    assert.equal(failed?.actorUserId, "usr_manager");
    assert.equal(failed?.result, "DENIED");
    assert.equal(failed?.category, "AUTH");
    assert.equal((await rpc("login", { login: "manager", password: "admin" }, null, office)).status, 200);
    const signed = await latest("LOGIN");
    assert.equal(signed?.actorUserId, "usr_manager");
    assert.equal(signed?.device, office.device);
    assert.equal(signed?.objectId, "obj_siyanie");
  });

  it("serves the log only with audit.view and by scope", async () => {
    assert.equal((await rpc("audit", null, manager)).status, 403);
    assert.equal((await rpc("audit", null, resident)).status, 403);
    const audit = await store();
    const company = audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: null, action: "ROLES_EDIT", targetType: "role", target: "Тест компании" });
    const park = audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_park", action: "OPEN_GATE", target: "Тест парка" });
    const pay = audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_siyanie", action: "PAY_INVOICE", target: "Тест оплаты" });
    const gate = audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_siyanie", action: "OPEN_GATE", target: "Тест ворот" });
    const foreign = audit.appendAudit({ actorUserId: "usr_other", companyId: "cmp_other", objectId: "obj_siyanie", action: "OPEN_GATE", target: "Чужая компания" });
    const ids = async (session: typeof admin, input: unknown = { limit: 500 }) => ((await rpc("audit", input, session)).body as Board).entries.map((row) => row.id);

    const chief = await ids(admin);
    assert.ok([company.id, park.id, pay.id, gate.id].every((id) => chief.includes(id)));
    assert.ok(!chief.includes(foreign.id));

    const local = await ids(objectAdmin);
    assert.ok(local.includes(pay.id) && local.includes(gate.id));
    assert.ok(!local.includes(company.id), "company-level records stay with company admins");
    assert.ok(!local.includes(park.id) && !local.includes(foreign.id));

    const guard = await ids(security);
    assert.ok(guard.includes(gate.id));
    assert.ok(!guard.includes(pay.id) && !guard.includes(company.id));
    const guardBoard = (await rpc("audit", null, security)).body as Board;
    assert.deepEqual(
      guardBoard.options.categories.map((item) => item.value),
      ["ACCESS", "SECURITY"],
    );

    const onlyFinance = await ids(admin, { category: "FINANCE", limit: 500 });
    assert.ok(onlyFinance.includes(pay.id) && !onlyFinance.includes(gate.id));
    const forged = await ids(objectAdmin, { objectId: "obj_park", limit: 500 });
    assert.ok(!forged.includes(park.id), "a foreign object filter is ignored, scope still applies");
  });

  it("shows a building guard only its building and shared object records", async () => {
    const people = await import("../../web/src/server/people-store");
    const catalog = await import("../../web/src/server/catalog-store");
    const audit = await store();
    const guard = people.createStaffMembership({ userId: "usr_security", companyId: "cmp_star", role: "SECURITY", objectId: "obj_park", buildingId: "bld_2", createdBy: "test" });
    const session = { userId: "usr_security", membershipId: guard.id };
    const [near] = catalog.unitIdsOfBuilding("bld_2");
    const [far] = catalog.unitIdsOfBuilding("bld_park_1");
    assert.ok(near && far);
    const entry = (target: string, extra: { unitId?: string; buildingId?: string; action?: string }) =>
      audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_park", action: extra.action ?? "OPEN_GATE", target, unitId: extra.unitId, buildingId: extra.buildingId });
    const own = entry("Свой корпус", { unitId: near });
    const other = entry("Другой корпус", { unitId: far });
    const otherBuilding = entry("Другой корпус без квартиры", { buildingId: "bld_park_1" });
    const shared = entry("Общий въезд", {});
    const alarm = entry("Общая тревога", { action: "RAISE_ALARM" });
    const rows = ((await rpc("audit", { limit: 500 }, session)).body as Board).entries.map((row) => row.id);
    assert.ok(rows.includes(own.id) && rows.includes(shared.id) && rows.includes(alarm.id));
    assert.ok(!rows.includes(other.id) && !rows.includes(otherBuilding.id));
    people.updateMembership(guard.id, { status: "REVOKED" });
  });

  it("keeps the dashboard and security desk on the same rules", async () => {
    const audit = await store();
    const gate = audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_siyanie", action: "OPEN_GATE", target: "Тест охраны" });
    const team = audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_siyanie", action: "TEAM_ADD", target: "Тест команды" });
    const guard = (((await rpc("desk", { section: "security" }, security)).body as Rows).audit ?? []).map((row) => row.id);
    const chief = (((await rpc("desk", { section: "security" }, admin)).body as Rows).audit ?? []).map((row) => row.id);
    assert.ok(guard.includes(gate.id) && !guard.includes(team.id));
    assert.ok(chief.includes(team.id));
    const feed = ((await rpc("dashboard", null, objectAdmin)).body as Dashboard).objects[0]?.feed?.map((item) => item.id) ?? [];
    assert.ok(feed.includes(team.id));
  });

  it("exports only with audit.export and records the export", async () => {
    assert.equal((await rpc("auditExport", null, security, office)).status, 403);
    assert.equal((await latest("AUDIT_EXPORT"))?.result, "DENIED");
    assert.equal(((await rpc("audit", null, security)).body as Board).canExport, false);
    const reply = await rpc("auditExport", { category: "ACCESS" }, admin, office);
    assert.equal(reply.status, 200);
    const csv = (reply.body as { csv: string }).csv;
    assert.ok(csv.startsWith("\ufeff\"Время\""));
    assert.ok(csv.includes("Открытие ворот"));
    assert.ok(!csv.includes("\"Оплата\""));
    const exported = await latest("AUDIT_EXPORT");
    assert.equal(exported?.result, "SUCCESS");
    assert.equal(exported?.actorUserId, "usr_admin");
  });

  it("neutralises spreadsheet formulas in the export", async () => {
    const audit = await store();
    audit.appendAudit({ actorUserId: "usr_admin", companyId: "cmp_star", objectId: "obj_siyanie", action: "OPEN_GATE", target: "=HYPERLINK(\"x\")" });
    const csv = ((await rpc("auditExport", { category: "ACCESS" }, admin)).body as { csv: string }).csv;
    assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));
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

describe("security post", () => {
  type Post = {
    objectId: string;
    can: Record<string, boolean>;
    alarms: { id: string; status: string; handledBy: string | null }[];
    points: { id: string }[];
    cameras: unknown[];
    passes: unknown[];
  };
  const auditRows = async (action: string) => (await import("../../web/src/server/audit-store")).listAudit().filter((row) => row.action === action);

  it("sends the guard straight to the post and keeps residents out", async () => {
    const { destinationFor, guardPath } = await import("../../web/src/server/routing");
    assert.equal(destinationFor(security.userId, security.membershipId), "/security");
    assert.equal(guardPath(security.userId, security.membershipId, "/security").redirect, undefined);
    assert.equal(guardPath(resident.userId, resident.membershipId, "/security").redirect, "/home");
    assert.equal((await rpc("securityPost", {}, resident)).status, 403);
    assert.equal((await rpc("securityPost", {}, accountant)).status, 403);
  });

  it("shows only shared access points and the object in scope", async () => {
    const reply = await rpc("securityPost", { objectId: "obj_park" }, security);
    assert.equal(reply.status, 403, "a guard of another object in the company gets 403");
    const body = (await rpc("securityPost", {}, security)).body as Post;
    assert.equal(body.objectId, "obj_siyanie");
    const ops = await import("../../web/src/server/ops-store");
    const shared = new Set(ops.devicesForObject("obj_siyanie").filter((device) => !device.unitId).map((device) => device.id));
    assert.ok(body.points.length > 0 && body.points.every((point) => shared.has(point.id)));
  });

  it("accepts and closes an alarm once, with audit", async () => {
    assert.equal((await rpc("alarm", null, resident)).status, 200);
    const open = ((await rpc("securityPost", {}, security)).body as Post).alarms.find((alarm) => alarm.status === "OPEN");
    assert.ok(open);
    assert.equal((await rpc("handleAlarm", { alarmId: open.id, step: "ACCEPT" }, resident)).status, 403);
    assert.equal((await rpc("handleAlarm", { alarmId: open.id, step: "ACCEPT" }, security)).status, 200);
    assert.equal((await rpc("handleAlarm", { alarmId: open.id, step: "ACCEPT" }, security)).status, 409);
    assert.equal((await rpc("handleAlarm", { alarmId: open.id, step: "CLOSE" }, security)).status, 200);
    assert.equal((await rpc("handleAlarm", { alarmId: open.id, step: "CLOSE" }, security)).status, 409);
    const closed = ((await rpc("securityPost", {}, security)).body as Post).alarms.find((alarm) => alarm.id === open.id);
    assert.equal(closed?.status, "CLOSED");
    assert.ok(closed?.handledBy);
    assert.ok((await auditRows("ALARM_ACCEPT")).some((row) => row.targetId === open.id));
    assert.ok((await auditRows("ALARM_CLOSE")).some((row) => row.targetId === open.id && row.result === "SUCCESS"));
  });

  it("opens shared points only and respects building reach", async () => {
    const opened = await rpc("openObjectPoint", { objectId: "obj_siyanie", pointId: "dev_wicket_siyanie" }, security);
    assert.equal(opened.status, 200);
    assert.equal((await rpc("openObjectPoint", { objectId: "obj_park", pointId: "dev_lock_84" }, admin)).status, 404, "unit locks are not guard points");
    assert.equal((await rpc("openObjectPoint", { objectId: "obj_park", pointId: "dev_gate_park" }, security)).status, 403);
    const people = await import("../../web/src/server/people-store");
    const guard = people.createStaffMembership({ userId: "usr_security", companyId: "cmp_star", role: "SECURITY", objectId: "obj_park", buildingId: "bld_2", createdBy: "test" });
    const session = { userId: "usr_security", membershipId: guard.id };
    assert.equal((await rpc("openObjectPoint", { objectId: "obj_park", pointId: "dev_gate_park" }, session)).status, 200);
    people.updateMembership(guard.id, { status: "REVOKED" });
  });

  it("serves the camera window only cameras of the object and frames by device id", async () => {
    type Wall = { objectId: string; cameras: { id: string; ready: boolean }[] };
    const reply = await rpc("securityCameras", {}, security);
    assert.equal(reply.status, 200);
    const wall = reply.body as Wall;
    assert.deepEqual(Object.keys(wall).sort(), ["cameras", "objectId", "objectName", "objects"]);
    const ops = await import("../../web/src/server/ops-store");
    const own = new Set(ops.devicesForObject("obj_siyanie").filter((device) => device.kind === "CAMERA").map((device) => device.id));
    assert.ok(wall.cameras.length > 0 && wall.cameras.every((camera) => own.has(camera.id)));
    assert.equal((await rpc("securityCameras", { objectId: "obj_park" }, security)).status, 403);
    assert.equal((await rpc("securityCameras", {}, resident)).status, 403);
    assert.equal((await rpc("securityCameras", {}, accountant)).status, 403);

    const camera = wall.cameras[0];
    assert.ok(camera);
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", deviceId: camera.id }, security)).status, 200);
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", deviceId: "dev_gate_siyanie" }, security)).status, 404, "only cameras give frames");
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", name: "Камера входа" }, security)).status, 400);
    const setWork = (work: "ON" | "OFF") => {
      const file = ops.readOps();
      const device = file.devices.find((item) => item.id === camera.id);
      if (device) device.work = work;
      ops.writeOps(file);
    };
    setWork("OFF");
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", deviceId: camera.id }, security)).status, 409);
    setWork("ON");
  });

  it("checks a pass code and records the result", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const pass = ops.passesForObject("obj_siyanie")[0];
    assert.ok(pass);
    const found = await rpc("checkPass", { objectId: "obj_siyanie", code: pass.code.toLowerCase() }, security);
    assert.equal(found.status, 200);
    assert.equal((found.body as { guestName: string }).guestName, pass.guestName);
    assert.equal((await rpc("checkPass", { objectId: "obj_siyanie", code: "ZZZZ9999" }, security)).status, 404);
    const rows = await auditRows("PASS_CHECK");
    assert.ok(rows.some((row) => row.result === "SUCCESS") && rows.some((row) => row.result === "DENIED"));
  });
});

describe("engineering", () => {
  type Board = { objects: { objectId: string; systems: { id: string; state: string; devices: { id: string; reading: string | null }[] }[] }[]; can: { poll: boolean; edit: boolean } };

  it("shows all four systems and never invents readings", async () => {
    const reply = await rpc("engineering", null, objectAdmin);
    assert.equal(reply.status, 200);
    const board = reply.body as Board;
    assert.deepEqual(board.objects.map((object) => object.objectId), ["obj_siyanie"]);
    const systems = board.objects[0]?.systems ?? [];
    assert.deepEqual(systems.map((system) => system.id), ["heat", "water", "power", "fire"]);
    const fire = systems.find((system) => system.id === "fire");
    assert.equal(fire?.devices.length === 0 ? fire.state : "Не подключено", "Не подключено");
    const leak = systems.flatMap((system) => system.devices).find((device) => device.id === "dev_leak_24");
    assert.equal(leak?.reading ?? null, null);
    assert.equal((await rpc("engineering", null, resident)).status, 403);
    assert.equal((await rpc("engineering", null, security)).status, 403);
  });

  it("polls through the adapter and records an honest result", async () => {
    const leak = await rpc("pollDevice", { objectId: "obj_siyanie", deviceId: "dev_leak_24" }, manager);
    assert.equal(leak.status, 200);
    assert.equal((leak.body as { confirmed: boolean }).confirmed, false);
    const audit = (await import("../../web/src/server/audit-store")).listAudit();
    assert.ok(audit.some((row) => row.action === "DEVICE_POLL" && row.targetId === "dev_leak_24" && row.result === "ERROR"));
    assert.equal((await rpc("pollDevice", { objectId: "obj_park", deviceId: "dev_climate_84" }, manager)).status, 403);
  });

  it("lets only engineering.edit take a device out of work", async () => {
    const input = { objectId: "obj_siyanie", deviceId: "dev_climate_24", work: "OFF" };
    assert.equal((await rpc("setDeviceWork", input, manager)).status, 403);
    assert.equal((await rpc("setDeviceWork", input, objectAdmin)).status, 200);
    assert.equal((await rpc("pollDevice", { objectId: "obj_siyanie", deviceId: "dev_climate_24" }, objectAdmin)).status, 409);
    const audit = (await import("../../web/src/server/audit-store")).listAudit();
    assert.ok(audit.some((row) => row.action === "DEVICE_STATUS" && row.targetId === "dev_climate_24" && row.changes?.some((change) => change.to === "Выведено из работы")));
    assert.equal((await rpc("setDeviceWork", { ...input, work: "ON" }, objectAdmin)).status, 200);
  });
});
