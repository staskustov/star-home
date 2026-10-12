import "./register-paths";
import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";

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
  delete process.env.STAR_HOME_PROBE_TIMEOUT_MS;
});

async function registerLight(name: string, extra: Record<string, unknown> = {}) {
  const registered = await rpc(
    "registerDevice",
    {
      objectId: "obj_siyanie",
      unitId: "unit_24",
      roomId: "room_24_living",
      name,
      kind: "LIGHTING",
      capabilities: ["power"],
      ...extra,
    },
    objectAdmin,
  );
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  return (registered.body as { id: string }).id;
}

describe("stage 6 specialist console", () => {
  it("hides a newly registered device from the resident until handover", async () => {
    const deviceId = await registerLight("Свет ввод");
    const listed = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      devices: { id: string; handedOver?: boolean }[];
    };
    assert.equal(listed.devices.find((item) => item.id === deviceId)?.handedOver, false);
    const cards = (await rpc("smartHomeDevices", {}, resident)).body as { devices: { id: string }[] };
    assert.ok(!cards.devices.some((item) => item.id === deviceId));
    assert.ok(cards.devices.some((item) => item.id === "dev_light_24"));
    const opened = await rpc("smartHomeDevice", { deviceId }, resident);
    assert.ok(opened.status === 403 || opened.status === 404, JSON.stringify(opened.body));
  });

  it("keeps seed devices visible when handedOver is omitted", async () => {
    const cards = (await rpc("smartHomeDevices", {}, resident)).body as { devices: { id: string }[] };
    assert.ok(cards.devices.some((item) => item.id === "dev_light_24"));
    assert.ok(cards.devices.some((item) => item.id === "dev_gate_siyanie"));
  });

  it("probes a local device and reports elapsed milliseconds", async () => {
    const deviceId = await registerLight("Свет проверка");
    const probed = await rpc("probeDevice", { deviceId }, objectAdmin);
    assert.equal(probed.status, 200, JSON.stringify(probed.body));
    const body = probed.body as { confirmed: boolean; elapsedMs: number; message: string; lastProbeResult: string };
    assert.equal(body.confirmed, true);
    assert.equal(typeof body.elapsedMs, "number");
    assert.ok(body.elapsedMs >= 0);
    assert.ok(Number.isFinite(body.elapsedMs));
    assert.match(body.message, /мс · подтверждено/);
    assert.equal(body.lastProbeResult, "confirmed");
  });

  it("refuses handover before a successful probe", async () => {
    const deviceId = await registerLight("Свет без проверки");
    const handed = await rpc("handOverDevice", { deviceId }, objectAdmin);
    assert.equal(handed.status, 400, JSON.stringify(handed.body));
    assert.match(String((handed.body as { message?: string }).message), /проверьте/i);
  });

  it("hands a probed device to the resident and can take it back", async () => {
    const deviceId = await registerLight("Свет жильцу");
    assert.equal((await rpc("probeDevice", { deviceId }, objectAdmin)).status, 200);
    const handed = await rpc("handOverDevice", { deviceId }, objectAdmin);
    assert.equal(handed.status, 200, JSON.stringify(handed.body));
    assert.equal((handed.body as { handedOver: boolean }).handedOver, true);
    const cards = (await rpc("smartHomeDevices", {}, resident)).body as { devices: { id: string }[] };
    assert.ok(cards.devices.some((item) => item.id === deviceId));
    const recalled = await rpc("handOverDevice", { deviceId, recall: true }, objectAdmin);
    assert.equal(recalled.status, 200, JSON.stringify(recalled.body));
    const hidden = (await rpc("smartHomeDevices", {}, resident)).body as { devices: { id: string }[] };
    assert.ok(!hidden.devices.some((item) => item.id === deviceId));
  });

  it("closes probe and handover to the resident", async () => {
    assert.equal((await rpc("probeDevice", { deviceId: "dev_light_24" }, resident)).status, 403);
    assert.equal((await rpc("handOverDevice", { deviceId: "dev_light_24" }, resident)).status, 403);
  });

  it("does not confirm a Wiren Board probe without an ack", async () => {
    process.env.STAR_HOME_PROBE_TIMEOUT_MS = "120";
    const ops = await import("../../web/src/server/ops-store");
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB проверка", adapter: "wirenboard" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const file = ops.readOps();
    const gateway = file.gateways.find((item) => item.id === gatewayId);
    assert.ok(gateway);
    gateway.status = "ONLINE";
    ops.writeOps(file);
    const deviceId = await registerLight("Свет WB таймаут", { gatewayId, externalId: "wb-probe-timeout" });
    const started = Date.now();
    const probed = await rpc("probeDevice", { deviceId }, objectAdmin);
    const elapsed = Date.now() - started;
    assert.equal(probed.status, 200, JSON.stringify(probed.body));
    const body = probed.body as { confirmed: boolean; elapsedMs: number; message: string };
    assert.equal(body.confirmed, false);
    assert.match(body.message, /нет ответа/);
    assert.ok(body.elapsedMs >= 100);
    assert.ok(elapsed < 4000);
  });

  it("confirms a Wiren Board probe after the gateway acks", async () => {
    process.env.STAR_HOME_PROBE_TIMEOUT_MS = "2000";
    const ops = await import("../../web/src/server/ops-store");
    const queue = await import("../../web/src/server/gateway-queue");
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB ack", adapter: "wirenboard" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const file = ops.readOps();
    const gateway = file.gateways.find((item) => item.id === gatewayId);
    assert.ok(gateway);
    gateway.status = "ONLINE";
    ops.writeOps(file);
    const deviceId = await registerLight("Свет WB ack", { gatewayId, externalId: "wb-probe-ack" });
    const pending = rpc("probeDevice", { deviceId }, objectAdmin);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const queued = ops.readOps().gatewayCommands.find((item) => item.deviceId === deviceId && item.status === "PENDING");
    assert.ok(queued, "probe must enqueue a gateway command");
    const acked = queue.ackGatewayCommand(gatewayId, { commandId: queued.id, confirmed: true, state: { on: true } });
    assert.equal(acked.ok, true);
    const probed = await pending;
    assert.equal(probed.status, 200, JSON.stringify(probed.body));
    const body = probed.body as { confirmed: boolean; elapsedMs: number; message: string };
    assert.equal(body.confirmed, true);
    assert.match(body.message, /подтверждено/);
    assert.ok(body.elapsedMs >= 0);
    assert.ok(body.elapsedMs < 2000);
  });
});
