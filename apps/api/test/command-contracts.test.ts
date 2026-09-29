import "./register-paths";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
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

describe("stage 1 command and registry contracts", () => {
  it("registers a device on a Wiren Board gateway with the gateway adapter", async () => {
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB контракт", adapter: "wirenboard" }, admin);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const gatewayId = (created.body as { id: string }).id;
    const registered = await rpc(
      "registerDevice",
      {
        objectId: "obj_siyanie",
        unitId: "unit_24",
        roomId: "room_24_living",
        gatewayId,
        name: "Реле WB",
        kind: "LIGHTING",
        externalId: "wb-relay-contract",
        capabilities: ["power"],
      },
      objectAdmin,
    );
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const deviceId = (registered.body as { id: string }).id;
    const listed = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      devices: { id: string; adapter: string; gatewayId: string | null }[];
    };
    const device = listed.devices.find((item) => item.id === deviceId);
    assert.equal(device?.adapter, "wirenboard");
    assert.equal(device?.gatewayId, gatewayId);
    assert.notEqual(device?.adapter, "local");
  });

  it("accepts a Wiren Board command without confirming or executing in the cloud", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB очередь", adapter: "wirenboard" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const file = ops.readOps();
    const gateway = file.gateways.find((item) => item.id === gatewayId);
    assert.ok(gateway);
    gateway.status = "ONLINE";
    ops.writeOps(file);
    const registered = await rpc(
      "registerDevice",
      {
        objectId: "obj_siyanie",
        roomId: "room_24_living",
        gatewayId,
        name: "Свет WB",
        kind: "LIGHTING",
        externalId: "wb-light-contract",
        capabilities: ["power"],
      },
      objectAdmin,
    );
    const deviceId = (registered.body as { id: string }).id;
    const before = ops.readOps().devices.find((item) => item.id === deviceId);
    assert.equal(before?.state?.on, undefined);
    const commanded = await rpc("commandDeviceSmart", { deviceId, command: "setPower", value: true }, resident);
    assert.equal(commanded.status, 200, JSON.stringify(commanded.body));
    const body = commanded.body as { confirmed: boolean; status: string; message: string; commandId?: string };
    assert.equal(body.confirmed, false);
    assert.equal(body.status, "accepted");
    assert.equal(body.message.includes("выполнена"), false);
    assert.match(body.message, /принята/i);
    assert.ok(body.commandId);
    const after = ops.readOps();
    assert.equal(after.devices.find((item) => item.id === deviceId)?.state?.on, undefined);
    const queued = after.gatewayCommands.find((item) => item.id === body.commandId);
    assert.equal(queued?.status, "PENDING");
    assert.equal(queued?.command, "setPower");
  });

  it("still confirms a local demo lighting command", async () => {
    const commanded = await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: true }, resident);
    assert.equal(commanded.status, 200, JSON.stringify(commanded.body));
    const body = commanded.body as { confirmed: boolean; status: string; message: string };
    assert.equal(body.confirmed, true);
    assert.equal(body.status, "confirmed");
    assert.match(body.message, /выполнена/);
  });

  it("queues a command when the Wiren Board gateway is offline", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB оффлайн", adapter: "wirenboard" }, admin);
    const gatewayId = (created.body as { id: string }).id;
    const registered = await rpc(
      "registerDevice",
      {
        objectId: "obj_siyanie",
        roomId: "room_24_living",
        gatewayId,
        name: "Свет оффлайн",
        kind: "LIGHTING",
        externalId: "wb-offline-contract",
        capabilities: ["power"],
      },
      objectAdmin,
    );
    const deviceId = (registered.body as { id: string }).id;
    assert.equal(ops.readOps().gateways.find((item) => item.id === gatewayId)?.status, "OFFLINE");
    const commanded = await rpc("commandDeviceSmart", { deviceId, command: "setPower", value: true }, resident);
    const body = commanded.body as { confirmed: boolean; status: string };
    assert.equal(body.confirmed, false);
    assert.equal(body.status, "queued");
  });
});
