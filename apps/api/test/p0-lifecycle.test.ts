import "./register-paths";
import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";
import { listAudit } from "../../web/src/server/audit-store";
import { executeOnAdapter } from "../../web/src/server/gateway-adapter";
import { dataSourceOf, demoExecutionAllowed, productionRuntime } from "../../web/src/server/runtime-mode";
import { commandLifecycleOf, stateMatchesCommand } from "../../web/src/server/command-lifecycle";
import { confirmCommandsFromState, enqueueGatewayCommand } from "../../web/src/server/gateway-queue";
import { qualityOf } from "../../web/src/server/device-channels";

type Reply = { status: number; body: unknown };

const memory = new Map<string, unknown>();
bindStore({
  load: (name) => memory.get(name),
  save: (name, value) => {
    memory.set(name, JSON.parse(JSON.stringify(value)));
  },
});

const admin = { userId: "usr_admin", membershipId: "mem_admin" };
const objectAdmin = { userId: "usr_object", membershipId: "mem_object_siyanie" };
const resident = { userId: "usr_stanislav", membershipId: "mem_stanislav_24" };

let rpc: (method: string, input: unknown, session: { userId: string; membershipId: string | null } | null) => Promise<Reply>;

before(async () => {
  rpc = (await import("../../web/src/server/rpc-handlers")).handleRpc;
});

afterEach(() => {
  process.env.NODE_ENV = "test";
  delete process.env.STAR_HOME_ALLOW_DEMO;
});

async function wirenboardSite(name: string, kind: "LIGHTING" | "GATE" = "LIGHTING") {
  const created = await rpc("createGateway", { objectId: "obj_siyanie", name, adapter: "wirenboard" }, admin);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const gatewayId = (created.body as { id: string }).id;
  const ops = await import("../../web/src/server/ops-store");
  const file = ops.readOps();
  const gateway = file.gateways.find((item) => item.id === gatewayId);
  assert.ok(gateway);
  gateway.status = "ONLINE";
  ops.writeOps(file);
  const registered = await rpc(
    "registerDevice",
    {
      objectId: "obj_siyanie",
      roomId: kind === "GATE" ? undefined : "room_24_living",
      place: kind === "GATE" ? "OBJECT" : undefined,
      gatewayId,
      name,
      kind,
      externalId: `wb-${name}`,
      capabilities: kind === "GATE" ? ["latch"] : ["power"],
    },
    objectAdmin,
  );
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  return { gatewayId, deviceId: (registered.body as { id: string }).id };
}

describe("P0 command lifecycle", () => {
  it("puts a smart-home command into the gateway queue", async () => {
    const { deviceId } = await wirenboardSite("P0 очередь свет");
    const ops = await import("../../web/src/server/ops-store");
    const before = ops.readOps().devices.find((item) => item.id === deviceId);
    assert.equal(before?.state?.on, undefined);
    const commanded = await rpc("commandDeviceSmart", { deviceId, command: "setPower", value: true }, objectAdmin);
    const body = commanded.body as { confirmed: boolean; status: string; lifecycle?: string; commandId?: string };
    assert.equal(body.confirmed, false);
    assert.equal(body.status, "accepted");
    assert.equal(body.lifecycle, "ACCEPTED");
    assert.ok(body.commandId);
    const queued = ops.readOps().gatewayCommands.find((item) => item.id === body.commandId);
    assert.equal(queued?.status, "PENDING");
    assert.equal(ops.readOps().devices.find((item) => item.id === deviceId)?.state?.on, undefined);
  });

  it("puts a gate command into the same queue without HIGH confirm", async () => {
    const { gatewayId, deviceId } = await wirenboardSite("P0 ворота", "GATE");
    const opened = await rpc("openPoint", { pointId: deviceId }, resident);
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    const body = opened.body as { confirmed: boolean; status?: string; commandId?: string; lifecycle?: string };
    assert.equal(body.confirmed, false);
    assert.ok(body.commandId);
    assert.equal(body.lifecycle, "ACCEPTED");
    const ops = await import("../../web/src/server/ops-store");
    const queued = ops.readOps().gatewayCommands.find((item) => item.id === body.commandId);
    assert.equal(queued?.gatewayId, gatewayId);
    assert.equal(queued?.command, "open");
    assert.equal(queued?.status, "PENDING");
    const device = ops.readOps().devices.find((item) => item.id === deviceId);
    assert.notEqual(device?.latch, "OPEN");
  });

  it("blocks the direct adapter execute path for a Wiren Board device", async () => {
    const { deviceId } = await wirenboardSite("P0 прямой адаптер");
    const ops = await import("../../web/src/server/ops-store");
    const device = ops.readOps().devices.find((item) => item.id === deviceId);
    assert.ok(device);
    const result = await executeOnAdapter(device, "setPower", true);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "awaiting-gateway");
  });

  it("does not let the demo adapter report physical success in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.STAR_HOME_ALLOW_DEMO;
    assert.equal(productionRuntime(), true);
    assert.equal(demoExecutionAllowed(), false);
    const ops = await import("../../web/src/server/ops-store");
    const light = ops.readOps().devices.find((item) => item.id === "dev_light_24");
    assert.ok(light);
    const result = await executeOnAdapter(light, "setPower", true);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "demo-adapter-forbidden");
    const forbidden = listAudit().find((entry) => entry.action === "DEMO_ADAPTER_FORBIDDEN");
    assert.ok(forbidden);
    const commanded = await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    assert.equal((commanded.body as { confirmed: boolean }).confirmed, false);
  });

  it("labels seed devices DEMO and Wiren Board devices REAL", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const seed = ops.readOps().devices.find((item) => item.id === "dev_light_24");
    assert.ok(seed);
    assert.equal(dataSourceOf(seed), "DEMO");
    const { deviceId } = await wirenboardSite("P0 источник REAL");
    const registered = ops.readOps().devices.find((item) => item.id === deviceId);
    assert.ok(registered);
    assert.equal(dataSourceOf(registered), "REAL");
    const listed = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      devices: { id: string; source?: string }[];
    };
    assert.equal(listed.devices.find((item) => item.id === deviceId)?.source, "REAL");
    const home = (await rpc("home", null, resident)).body as { home: { weather?: { source?: string }; cameras: { state: string }[] } };
    assert.equal(home.home.weather?.source, "DEMO");
    assert.ok(home.home.cameras.every((camera) => camera.state !== "На связи"));
  });

  it("maps queue statuses onto the command lifecycle", () => {
    assert.equal(commandLifecycleOf("PENDING"), "ACCEPTED");
    assert.equal(commandLifecycleOf("SENT"), "DELIVERED");
    assert.equal(commandLifecycleOf("ACKED"), "CONFIRMED");
    assert.equal(commandLifecycleOf("FAILED", "mqtt-timeout"), "TIMEOUT");
    assert.equal(commandLifecycleOf("EXPIRED"), "TIMEOUT");
    assert.equal(commandLifecycleOf("FAILED", "denied"), "FAILED");
  });

  it("expires a queued command as TIMEOUT", async () => {
    const { gatewayId, deviceId } = await wirenboardSite("P0 timeout");
    const row = enqueueGatewayCommand({ gatewayId, deviceId, command: "setPower", value: true });
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const current = file.gatewayCommands.find((item) => item.id === row.id);
    assert.ok(current);
    current.createdAt = new Date(Date.now() - 20 * 60_000).toISOString();
    current.expiresAt = new Date(Date.now() - 60_000).toISOString();
    ops.expireGatewayCommands(file, Date.now());
    ops.writeOps(file);
    assert.equal(ops.readOps().gatewayCommands.find((item) => item.id === row.id)?.status, "EXPIRED");
    assert.equal(commandLifecycleOf("EXPIRED"), "TIMEOUT");
  });

  it("reuses a pending command with the same value and keeps a different value separate", async () => {
    const { gatewayId, deviceId } = await wirenboardSite("P0 idempotency");
    const first = enqueueGatewayCommand({ gatewayId, deviceId, command: "setPower", value: true });
    const again = enqueueGatewayCommand({ gatewayId, deviceId, command: "setPower", value: true });
    assert.equal(again.id, first.id);
    const off = enqueueGatewayCommand({ gatewayId, deviceId, command: "setPower", value: false });
    assert.notEqual(off.id, first.id);
  });

  it("queues when the gateway is offline and does not mark the device online", async () => {
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "P0 offline gw", adapter: "wirenboard" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const registered = await rpc(
      "registerDevice",
      {
        objectId: "obj_siyanie",
        roomId: "room_24_living",
        gatewayId,
        name: "P0 offline light",
        kind: "LIGHTING",
        externalId: "wb-p0-off",
        capabilities: ["power"],
      },
      objectAdmin,
    );
    assert.equal(registered.status, 201);
    const deviceId = (registered.body as { id: string }).id;
    const commanded = await rpc("commandDeviceSmart", { deviceId, command: "setPower", value: true }, objectAdmin);
    const body = commanded.body as { confirmed: boolean; status: string };
    assert.equal(body.confirmed, false);
    assert.equal(body.status, "queued");
    const ops = await import("../../web/src/server/ops-store");
    const device = ops.readOps().devices.find((item) => item.id === deviceId);
    assert.notEqual(device?.availability, "ONLINE");
  });

  it("keeps a device offline while the gateway is online without telemetry", async () => {
    const { gatewayId, deviceId } = await wirenboardSite("P0 device offline");
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const gateway = file.gateways.find((item) => item.id === gatewayId);
    const device = file.devices.find((item) => item.id === deviceId);
    assert.ok(gateway);
    assert.ok(device);
    gateway.status = "ONLINE";
    gateway.lastSeen = new Date().toISOString();
    device.availability = "OFFLINE";
    device.lastSeen = null;
    ops.writeOps(file);
    const listed = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      devices: { id: string; availability: string }[];
    };
    assert.equal(listed.devices.find((item) => item.id === deviceId)?.availability, "OFFLINE");
    assert.equal(ops.readOps().gateways.find((item) => item.id === gatewayId)?.status, "ONLINE");
  });

  it("marks telemetry STALE and does not treat missing values as zero", () => {
    assert.equal(qualityOf("STALE", "ONLINE"), "STALE");
    assert.equal(qualityOf("LIVE", "ONLINE"), "GOOD");
    assert.equal(qualityOf("NONE", "UNKNOWN"), "UNKNOWN");
  });

  it("confirms a command only after matching device state", async () => {
    const { gatewayId, deviceId } = await wirenboardSite("P0 confirm state");
    const row = enqueueGatewayCommand({ gatewayId, deviceId, command: "setPower", value: true });
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const current = file.gatewayCommands.find((item) => item.id === row.id);
    assert.ok(current);
    current.status = "SENT";
    assert.equal(stateMatchesCommand("setPower", true, { on: false }), false);
    const confirmed = confirmCommandsFromState(file, deviceId, { on: true });
    ops.writeOps(file);
    assert.equal(confirmed.includes(row.id), true);
    assert.equal(ops.readOps().gatewayCommands.find((item) => item.id === row.id)?.status, "ACKED");
  });

  it("rejects an unauthorized resident command", async () => {
    const reply = await rpc("commandDeviceSmart", { deviceId: "dev_lock_84", command: "open" }, resident);
    assert.ok(reply.status === 403 || reply.status === 404, JSON.stringify(reply.body));
  });

  it("rejects a cross-company command", async () => {
    const people = await import("../../web/src/server/people-store");
    const person = people.createPerson({ login: "p0.other", name: "Чужая", passwordHash: "x" });
    const membership = people.createResidentMembership({
      userId: person.id,
      companyId: "cmp_star",
      objectId: "obj_park",
      unitId: "unit_84",
    });
    const other = { userId: person.id, membershipId: membership.id };
    const reply = await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, other);
    assert.ok(reply.status === 403 || reply.status === 404, JSON.stringify(reply.body));
  });
});
