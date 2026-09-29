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
    assert.deepEqual(mapWirenboardInbound("/devices/wb-msw3/controls/Temperature", 22.4), {
      externalId: "wb-msw3",
      state: { temperatureC: 22.4 },
    });
    assert.equal(mapWirenboardInbound("other/topic", { on: true }), null);
  });

  it("groups native Wiren Board controls into one physical device", async () => {
    const { groupWirenboardDiscovery } = await import("../../web/src/server/adapters/wirenboard-controls");
    const found = groupWirenboardDiscovery([
      { topic: "/devices/wb-msw3/controls/Temperature", value: 22.4 },
      { topic: "/devices/wb-msw3/controls/Humidity", value: 48 },
      { topic: "/devices/wb-msw3/controls/Illuminance", value: 320 },
      { topic: "/devices/wb-msw3/controls/CO2", value: 650 },
    ]);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.externalId, "wb-msw3");
    assert.deepEqual(
      found[0]?.channels.map((channel) => [channel.capability, channel.unit, channel.value]),
      [
        ["temperature", "°C", 22.4],
        ["humidity", "%", 48],
        ["illuminance", "lx", 320],
        ["co2", "ppm", 650],
      ],
    );
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

  it("does not let the local adapter confirm a device on a Wiren Board gateway", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const { cloudExecutesAdapter } = await import("../../web/src/server/gateway-adapter");
    assert.equal(cloudExecutesAdapter("wirenboard"), false);
    assert.equal(cloudExecutesAdapter("mqtt"), false);
    assert.equal(cloudExecutesAdapter("local"), true);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_paired_wb",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "WB paired",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
    });
    file.devices.push({ ...light, id: "dev_paired_light", gatewayId: "gw_paired_wb", adapter: "local" });
    ops.writeOps(file);
    const result = await executeOnAdapter(file.devices.find((item) => item.id === "dev_paired_light") as Device, "setPower", true);
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "awaiting-gateway");
  });

  it("rejects an unknown command on the local adapter", async () => {
    const result = await executeOnAdapter(light, "explode", true);
    assert.equal(result.confirmed, false);
  });

  it("keeps protocol stubs unconfirmed", async () => {
    await import("../../web/src/server/adapters/protocol-stubs");
    for (const kind of ["matter", "modbus", "knx", "zigbee", "onvif", "rs485"] as const) {
      assert.ok(knownGatewayAdapters().includes(kind), kind);
      const gateway = {
        id: `gw_${kind}`,
        companyId: "cmp_star",
        objectId: "obj_siyanie",
        unitId: null,
        name: kind,
        adapter: kind,
        status: "ONLINE" as const,
        version: null,
        lastSeen: null,
        lastError: null,
        internalAddress: null,
      };
      const result = await adapterFor(light, gateway).execute(light, "setPower", true);
      assert.equal(result.confirmed, false, kind);
      assert.equal(result.error, "adapter-unconfigured", kind);
    }
  });
});

describe("gateway channel", () => {
  it("accepts heartbeat and inbound state only with the pairing token", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "a".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_channel",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Канал",
      adapter: "local",
      status: "OFFLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({ ...light, id: "dev_channel_light", gatewayId: "gw_channel", state: { on: false } });
    ops.writeOps(file);
    assert.equal((await channel.heartbeatGateway(null, {})).ok, false);
    assert.equal((await channel.heartbeatGateway("wrong", {})).ok, false);
    const beat = channel.heartbeatGateway(token, { status: "ONLINE", version: "1.0" });
    assert.equal(beat.ok, true);
    assert.equal(ops.readOps().gateways.find((item) => item.id === "gw_channel")?.status, "ONLINE");
    const ingested = channel.ingestGatewayState(token, { deviceId: "dev_channel_light", state: { on: true } });
    assert.equal(ingested.ok, true);
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_channel_light")?.state?.on, true);
    assert.ok(ops.readOps().smartHistory.some((point) => point.deviceId === "dev_channel_light"));
  });

  it("pulls a queued command once and ignores a second ack", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const queue = await import("../../web/src/server/gateway-queue");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "b".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_queue",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Очередь",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({ ...light, id: "dev_queue_light", gatewayId: "gw_queue", state: { on: false } });
    ops.writeOps(file);
    const first = queue.enqueueGatewayCommand({ gatewayId: "gw_queue", deviceId: "dev_queue_light", command: "setPower", value: true });
    const again = queue.enqueueGatewayCommand({ gatewayId: "gw_queue", deviceId: "dev_queue_light", command: "setPower", value: true });
    assert.equal(first.id, again.id);
    const pulled = channel.pullGateway(token);
    assert.equal(pulled.ok, true);
    const acked = channel.ackGateway(token, { commandId: first.id, confirmed: true, state: { on: true } });
    const replay = channel.ackGateway(token, { commandId: first.id, confirmed: true, state: { on: false } });
    assert.equal(acked.ok && acked.value.applied, true);
    assert.equal(replay.ok && replay.value.applied, false);
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_queue_light")?.state?.on, true);
  });

  it("expires a queued command outside the replay window", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const queue = await import("../../web/src/server/gateway-queue");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "c".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_expire",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Окно",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({ ...light, id: "dev_expire_light", gatewayId: "gw_expire", state: { on: false } });
    ops.writeOps(file);
    const row = queue.enqueueGatewayCommand({ gatewayId: "gw_expire", deviceId: "dev_expire_light", command: "setPower", value: true });
    const next = ops.readOps();
    const queued = next.gatewayCommands.find((item) => item.id === row.id);
    assert.ok(queued);
    queued.createdAt = new Date(Date.now() - 16 * 60_000).toISOString();
    queued.expiresAt = new Date(Date.now() - 60_000).toISOString();
    ops.writeOps(next);
    const pulled = channel.pullGateway(token);
    assert.equal(pulled.ok, true);
    if (pulled.ok) assert.equal(pulled.value.commands.some((item) => item.id === row.id), false);
    const acked = channel.ackGateway(token, { commandId: row.id, confirmed: true, state: { on: true } });
    assert.equal(acked.ok && acked.value.applied, false);
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_expire_light")?.state?.on, false);
  });

  it("writes channel values and history per capability on ingest", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "d".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_live",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Live",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({
      id: "dev_live_msw",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
      kind: "CLIMATE",
      name: "MSW",
      adapter: "local",
      gatewayId: "gw_live",
      externalId: "wb-msw3-live",
      capabilities: ["temperature", "humidity", "illuminance", "co2"],
    });
    ops.writeOps(file);
    const ingested = channel.ingestGatewayState(token, {
      externalId: "wb-msw3-live",
      channels: [
        { externalId: "Temperature", value: 22.4 },
        { externalId: "Humidity", value: 48 },
        { externalId: "Illuminance", value: 320 },
        { externalId: "CO2", value: 650 },
      ],
    });
    assert.equal(ingested.ok, true);
    const device = ops.readOps().devices.find((item) => item.id === "dev_live_msw");
    assert.equal(device?.state?.temperatureC, 22.4);
    assert.equal(device?.state?.humidityPercent, 48);
    assert.equal(device?.channels?.find((item) => item.capability === "temperature")?.value, 22.4);
    assert.equal(device?.channels?.find((item) => item.capability === "humidity")?.status, "LIVE");
    const points = ops.readOps().smartHistory.filter((point) => point.deviceId === "dev_live_msw");
    assert.ok(points.some((point) => point.capability === "temperature" && point.state.temperatureC === 22.4));
    assert.ok(points.some((point) => point.capability === "humidity" && point.state.humidityPercent === 48));
    assert.equal(JSON.stringify(points).includes("topic"), false);
  });

  it("marks gateway devices offline without inventing reconnect points", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "e".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_gap",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Gap",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: new Date().toISOString(),
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({
      id: "dev_gap_msw",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
      kind: "CLIMATE",
      name: "Разрыв",
      adapter: "local",
      gatewayId: "gw_gap",
      externalId: "wb-msw3-gap",
      capabilities: ["temperature", "humidity"],
      state: { temperatureC: 21 },
    });
    ops.writeOps(file);
    assert.equal(channel.ingestGatewayState(token, { deviceId: "dev_gap_msw", state: { temperatureC: 21 } }).ok, true);
    const aged = ops.readOps();
    for (const point of aged.smartHistory.filter((item) => item.deviceId === "dev_gap_msw")) {
      point.at = new Date(Date.now() - 10 * 60_000).toISOString();
    }
    ops.writeOps(aged);
    assert.equal(channel.heartbeatGateway(token, { status: "OFFLINE" }).ok, true);
    const offline = ops.readOps().devices.find((item) => item.id === "dev_gap_msw");
    assert.equal(offline?.availability, "OFFLINE");
    assert.equal(offline?.state?.temperatureC, 21);
    assert.equal(offline?.channels?.find((item) => item.capability === "temperature")?.status, "STALE");
    const before = ops.readOps().smartHistory.filter((point) => point.deviceId === "dev_gap_msw" && point.capability === "temperature").length;
    assert.equal(channel.heartbeatGateway(token, { status: "ONLINE" }).ok, true);
    const reconnect = ops.readOps().devices.find((item) => item.id === "dev_gap_msw");
    assert.equal(reconnect?.availability, "OFFLINE");
    assert.equal(
      ops.readOps().smartHistory.filter((point) => point.deviceId === "dev_gap_msw" && point.capability === "temperature").length,
      before,
    );
    assert.equal(channel.ingestGatewayState(token, { deviceId: "dev_gap_msw", state: { temperatureC: 23.1 } }).ok, true);
    const after = ops.readOps();
    const live = after.devices.find((item) => item.id === "dev_gap_msw");
    assert.equal(live?.availability, "ONLINE");
    assert.equal(live?.state?.temperatureC, 23.1);
    const temps = after.smartHistory.filter((point) => point.deviceId === "dev_gap_msw" && point.capability === "temperature");
    assert.ok(temps.length >= 2);
    assert.equal(temps.at(-1)?.state.temperatureC, 23.1);
    const first = Date.parse(temps[0]?.at ?? "");
    const last = Date.parse(temps.at(-1)?.at ?? "");
    assert.ok(last - first >= 60_000);
    const invented = temps.filter((point) => point.state.temperatureC === 22);
    assert.equal(invented.length, 0);
  });

  it("downsamples history instead of inventing points", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    const now = new Date().toISOString();
    ops.recordSmartHistory(file, { deviceId: "dev_series", objectId: "obj_siyanie", at: now, state: { temperatureC: 21 } });
    ops.recordSmartHistory(file, { deviceId: "dev_series", objectId: "obj_siyanie", at: new Date(Date.now() + 30_000).toISOString(), state: { temperatureC: 22 } });
    const points = file.smartHistory.filter((point) => point.deviceId === "dev_series");
    assert.equal(points.length, 1);
    assert.equal(points[0]?.state.temperatureC, 22);
  });

  it("records sent without applying state, then confirms once", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const queue = await import("../../web/src/server/gateway-queue");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "f".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_sent",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Sent",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({ ...light, id: "dev_sent_light", gatewayId: "gw_sent", externalId: "wb-relay-sent", adapter: "wirenboard", state: { on: false } });
    ops.writeOps(file);
    const row = queue.enqueueGatewayCommand({ gatewayId: "gw_sent", deviceId: "dev_sent_light", command: "setPower", value: true });
    const pulled = channel.pullGateway(token);
    assert.equal(pulled.ok, true);
    if (pulled.ok) {
      const command = pulled.value.commands.find((item) => item.id === row.id);
      assert.equal(command?.externalId, "wb-relay-sent");
      assert.equal(command?.adapter, "wirenboard");
    }
    const sent = channel.ackGateway(token, { commandId: row.id, confirmed: false, sent: true });
    assert.equal(sent.ok && sent.value.applied, false);
    assert.equal(ops.readOps().gatewayCommands.find((item) => item.id === row.id)?.status, "SENT");
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_sent_light")?.state?.on, false);
    const confirmed = channel.ackGateway(token, { commandId: row.id, confirmed: true, state: { on: true } });
    assert.equal(confirmed.ok && confirmed.value.applied, true);
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_sent_light")?.state?.on, true);
  });

  it("marks a timed-out MQTT command FAILED and does not apply state", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const queue = await import("../../web/src/server/gateway-queue");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "h".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_timeout",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Timeout",
      adapter: "wirenboard",
      status: "ONLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    file.devices.push({ ...light, id: "dev_timeout_light", gatewayId: "gw_timeout", externalId: "wb-relay-timeout", adapter: "wirenboard", state: { on: false } });
    ops.writeOps(file);
    const pending = queue.enqueueGatewayCommand({ gatewayId: "gw_timeout", deviceId: "dev_timeout_light", command: "setPower", value: true });
    const timedOut = channel.ackGateway(token, { commandId: pending.id, confirmed: false, sent: true, error: "mqtt-timeout" });
    assert.equal(timedOut.ok, true);
    assert.equal(timedOut.ok && timedOut.value.applied, false);
    assert.equal(ops.readOps().gatewayCommands.find((item) => item.id === pending.id)?.status, "FAILED");
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_timeout_light")?.state?.on, false);
    const sentFirst = queue.enqueueGatewayCommand({ gatewayId: "gw_timeout", deviceId: "dev_timeout_light", command: "setPower", value: true });
    channel.ackGateway(token, { commandId: sentFirst.id, confirmed: false, sent: true });
    assert.equal(ops.readOps().gatewayCommands.find((item) => item.id === sentFirst.id)?.status, "SENT");
    channel.ackGateway(token, { commandId: sentFirst.id, confirmed: false, sent: true, error: "mqtt-timeout" });
    assert.equal(ops.readOps().gatewayCommands.find((item) => item.id === sentFirst.id)?.status, "FAILED");
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_timeout_light")?.state?.on, false);
  });

  it("stores gateway lastError from a degraded heartbeat", async () => {
    const { createHash } = await import("crypto");
    const ops = await import("../../web/src/server/ops-store");
    const channel = await import("../../web/src/server/gateway-channel");
    const token = "g".repeat(48);
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_err",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Err",
      adapter: "wirenboard",
      status: "OFFLINE",
      version: null,
      lastSeen: null,
      lastError: null,
      internalAddress: null,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    ops.writeOps(file);
    assert.equal(channel.heartbeatGateway(token, { status: "DEGRADED", version: "agent-2.3", lastError: "mqtt-offline" }).ok, true);
    const gateway = ops.readOps().gateways.find((item) => item.id === "gw_err");
    assert.equal(gateway?.status, "DEGRADED");
    assert.equal(gateway?.version, "agent-2.3");
    assert.equal(gateway?.lastError, "mqtt-offline");
    const heartbeatLog = ops.readOps().gatewayExchanges.find((row) => row.gatewayId === "gw_err" && row.kind === "heartbeat");
    assert.equal(heartbeatLog?.detail.includes("DEGRADED"), true);
  });

  it("expires a silent gateway and does not invent last contact", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const contact = await import("../../web/src/server/gateway-contact");
    const format = await import("../../web/src/lib/format");
    const file = ops.readOps();
    file.gateways.push({
      id: "gw_stale",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      name: "Stale",
      adapter: "wirenboard",
      status: "ONLINE",
      version: "agent-5",
      lastSeen: new Date(Date.now() - 10 * 60_000).toISOString(),
      lastError: null,
      internalAddress: null,
      tokenHash: null,
    });
    file.devices.push({ ...light, id: "dev_stale_light", gatewayId: "gw_stale", adapter: "wirenboard", lastSeen: new Date(Date.now() - 10 * 60_000).toISOString() });
    ops.writeOps(file);
    const now = Date.now();
    assert.equal(contact.isGatewayStale(ops.readOps().gateways.find((item) => item.id === "gw_stale")!), true);
    const snapshot = ops.readOps();
    assert.equal(contact.expireStaleGateways(snapshot, now), true);
    ops.writeOps(snapshot);
    const expired = ops.readOps().gateways.find((item) => item.id === "gw_stale");
    assert.equal(expired?.status, "OFFLINE");
    assert.equal(expired?.lastError, "heartbeat-stale");
    assert.equal(snapshot.devices.find((item) => item.id === "dev_stale_light")?.availability, "OFFLINE");
    assert.equal(format.formatLastContact(null), "нет контакта");
    assert.equal(format.formatLastContact(new Date(now - 4_000).toISOString(), now), "только что");
    assert.equal(format.gatewayStatusLabel("UNKNOWN", null), "Нет контакта");
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
