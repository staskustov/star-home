import "./register-paths";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";
import type { Device, Gateway } from "../../web/src/server/ops-store";

const memory = new Map<string, unknown>();
bindStore({
  load: (name) => memory.get(name),
  save: (name, value) => {
    memory.set(name, JSON.parse(JSON.stringify(value)));
  },
});

const light: Device = {
  id: "dev_test_light",
  companyId: "cmp_star",
  objectId: "obj_siyanie",
  unitId: "unit_24",
  kind: "LIGHTING",
  name: "Свет",
  adapter: "local",
  capabilities: ["power", "brightness"],
  state: { on: false },
};

let mapWirenboardInbound: typeof import("../../web/src/server/adapters/wirenboard").mapWirenboardInbound;
let wirenboardPayload: typeof import("../../web/src/server/adapters/wirenboard").wirenboardPayload;
let wirenboardTopic: typeof import("../../web/src/server/adapters/wirenboard").wirenboardTopic;
let adapterFor: typeof import("../../web/src/server/gateway-adapter").adapterFor;
let executeOnAdapter: typeof import("../../web/src/server/gateway-adapter").executeOnAdapter;
let knownGatewayAdapters: typeof import("../../web/src/server/gateway-adapter").knownGatewayAdapters;
let liveAccept: typeof import("../../web/src/server/live-bus").liveAccept;
let liveIsNewer: typeof import("../../web/src/server/live-bus").liveIsNewer;

before(async () => {
  const wb = await import("../../web/src/server/adapters/wirenboard");
  const gateway = await import("../../web/src/server/gateway-adapter");
  const live = await import("../../web/src/server/live-bus");
  mapWirenboardInbound = wb.mapWirenboardInbound;
  wirenboardPayload = wb.wirenboardPayload;
  wirenboardTopic = wb.wirenboardTopic;
  adapterFor = gateway.adapterFor;
  executeOnAdapter = gateway.executeOnAdapter;
  knownGatewayAdapters = gateway.knownGatewayAdapters;
  liveAccept = live.liveAccept;
  liveIsNewer = live.liveIsNewer;
});

describe("gateway adapters", () => {
  it("registers wirenboard without core if-branches", async () => {
    assert.ok(knownGatewayAdapters().includes("wirenboard"));
    assert.ok(knownGatewayAdapters().includes("local"));
    const adapter = adapterFor(light, { id: "gw", companyId: "cmp_star", objectId: "obj_siyanie", unitId: null, name: "WB", adapter: "wirenboard", status: "ONLINE", version: null, lastSeen: null, lastError: null, internalAddress: null } satisfies Gateway);
    assert.equal(adapter.kind, "wirenboard");
  });

  it("maps wirenboard topics and inbound payloads", () => {
    assert.equal(wirenboardTopic("relay_1", "setPower"), "wb/relay_1/on");
    assert.deepEqual(wirenboardPayload("setPower", true), { on: true });
    assert.deepEqual(mapWirenboardInbound("wb/relay_1/on", { on: true }), { externalId: "relay_1", state: { on: true } });
    assert.equal(mapWirenboardInbound("other/topic", { on: true }), null);
  });

  it("does not confirm wirenboard without a local broker", async () => {
    delete process.env.STAR_HOME_WB_MQTT_URL;
    const device = { ...light, adapter: "mqtt" as const, externalId: "relay_1", gatewayId: "gw_wb" };
    const result = await adapterFor(device, { id: "gw_wb", companyId: "cmp_star", objectId: "obj_siyanie", unitId: null, name: "WB", adapter: "wirenboard", status: "ONLINE", version: null, lastSeen: null, lastError: null, internalAddress: null }).execute(device, "setPower", true);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "broker-unconfigured");
  });

  it("forbids non-local mqtt brokers", async () => {
    process.env.STAR_HOME_WB_MQTT_URL = "mqtt://example.com:1883";
    const device = { ...light, externalId: "relay_1" };
    const result = await adapterFor(device, { id: "gw", companyId: "cmp_star", objectId: "obj_siyanie", unitId: null, name: "WB", adapter: "wirenboard", status: "ONLINE", version: null, lastSeen: null, lastError: null, internalAddress: null }).execute(device, "setPower", true);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "broker-forbidden");
    delete process.env.STAR_HOME_WB_MQTT_URL;
  });

  it("keeps offline remote gateways unconfirmed", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_off",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "WB",
      adapter: "wirenboard",
      status: "OFFLINE",
      version: null,
      lastSeen: "23:41",
      lastError: "timeout",
      internalAddress: null,
    });
    file.devices.push({ ...light, id: "dev_off_light", gatewayId: "gw_off", adapter: "mqtt" });
    ops.writeOps(file);
    const result = await executeOnAdapter(file.devices.at(-1) as Device, "setPower", true);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "gateway-offline");
  });

  it("lets the local adapter confirm a lighting command", async () => {
    const result = await executeOnAdapter(light, "setPower", true);
    assert.equal(result.confirmed, true);
    assert.equal(result.state?.on, true);
  });

  it("rejects an unknown command on the local adapter", async () => {
    const result = await executeOnAdapter(light, "explode", true);
    assert.equal(result.confirmed, false);
  });
});

describe("live sequence", () => {
  it("applies updates, drops duplicates and stale seq", () => {
    const seen = new Set<number>();
    assert.equal(liveAccept(seen, 1), "apply");
    assert.equal(liveAccept(seen, 1), "duplicate");
    assert.equal(liveAccept(seen, 3), "apply");
    assert.equal(liveAccept(seen, 2), "stale");
    assert.equal(liveIsNewer(3, 4), true);
    assert.equal(liveIsNewer(4, 4), false);
  });
});
