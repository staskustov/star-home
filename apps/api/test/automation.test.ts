import "./register-paths";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { before, describe, it } from "node:test";
import { bindStore } from "../../web/src/server/store-bind";
import type { Device, Gateway } from "../../web/src/server/ops-store";

type Reply = { status: number; body: unknown };

const memory = new Map<string, unknown>();
bindStore({
  load: (name) => memory.get(name),
  save: (name, value) => {
    memory.set(name, JSON.parse(JSON.stringify(value)));
  },
});

const objectAdmin = { userId: "usr_object", membershipId: "mem_object_siyanie" };
const resident = { userId: "usr_stanislav", membershipId: "mem_stanislav_24" };

let rpc: (method: string, input: unknown, session: { userId: string; membershipId: string | null } | null) => Promise<Reply>;

before(async () => {
  rpc = (await import("../../web/src/server/rpc-handlers")).handleRpc;
});

function tokenOf(letter: string) {
  return letter.repeat(48);
}

function hashOf(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function wbSite(id: string, token: string) {
  const ops = await import("../../web/src/server/ops-store");
  const file = ops.readOps();
  const gateway: Gateway = {
    id,
    companyId: "cmp_star",
    objectId: "obj_siyanie",
    unitId: null,
    name: "WB авто",
    adapter: "wirenboard",
    status: "ONLINE",
    version: "agent-6",
    lastSeen: new Date().toISOString(),
    lastError: null,
    internalAddress: null,
    tokenHash: hashOf(token),
  };
  file.gateways.push(gateway);
  const leak: Device = {
    id: `${id}_leak`,
    companyId: "cmp_star",
    objectId: "obj_siyanie",
    unitId: "unit_24",
    kind: "LEAK",
    name: "Протечка авто",
    adapter: "wirenboard",
    gatewayId: id,
    externalId: "wb-leak",
    capabilities: ["leak"],
    metadata: { handedOver: true },
  };
  const valve: Device = {
    id: `${id}_valve`,
    companyId: "cmp_star",
    objectId: "obj_siyanie",
    unitId: "unit_24",
    kind: "WATER",
    name: "Клапан авто",
    adapter: "wirenboard",
    gatewayId: id,
    externalId: "wb-valve",
    capabilities: ["power"],
    metadata: { handedOver: true },
  };
  const lamp: Device = {
    id: `${id}_lamp`,
    companyId: "cmp_star",
    objectId: "obj_siyanie",
    unitId: "unit_24",
    kind: "LIGHTING",
    name: "Свет авто",
    adapter: "wirenboard",
    gatewayId: id,
    externalId: "wb-lamp",
    capabilities: ["power"],
    state: { on: false },
    metadata: { handedOver: true },
  };
  file.devices.push(leak, valve, lamp);
  ops.writeOps(file);
  return { leak, valve, lamp, gateway };
}

describe("stage 7 local automation", () => {
  it("infers gateway runtime for EVENT on a single Wiren Board gateway", async () => {
    const site = await wbSite("gw_auto_infer", tokenOf("k"));
    const created = await rpc(
      "createScenario",
      {
        name: "Свет по датчику",
        objectId: "obj_siyanie",
        trigger: "EVENT",
        conditions: [{ deviceId: site.leak.id, field: "detected", value: true }],
        steps: [{ deviceId: site.lamp.id, command: "setPower", value: true }],
      },
      objectAdmin,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const list = (await rpc("listScenarios", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      scenarios: { id: string; name: string; runtime?: string; executes?: boolean }[];
    };
    const row = list.scenarios.find((item) => item.name === "Свет по датчику");
    assert.equal(row?.runtime, "gateway");
    assert.equal(row?.executes, true);
  });

  it("does not run a gateway EVENT in the cloud", async () => {
    const created = await rpc(
      "createScenario",
      {
        name: "Только шлюз",
        trigger: "EVENT",
        runtime: "gateway",
        conditions: [{ deviceId: "dev_light_24", field: "on", value: false }],
        steps: [{ deviceId: "dev_curtain_24", command: "setPosition", value: 0 }],
      },
      resident,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await rpc("commandDeviceSmart", { deviceId: "dev_curtain_24", command: "setPosition", value: 80 }, resident);
    await rpc("commandDeviceSmart", { deviceId: "dev_light_24", command: "setPower", value: false }, resident);
    const curtain = (await rpc("smartHomeDevice", { deviceId: "dev_curtain_24" }, resident)).body as { device: { state?: { position?: number } } };
    assert.equal(curtain.device.state?.position, 80);
    const listed = (await rpc("listScenarios", {}, resident)).body as {
      scenarios: { name: string; runtime?: string; executes?: boolean }[];
    };
    const row = listed.scenarios.find((item) => item.name === "Только шлюз");
    assert.equal(row?.runtime, "gateway");
    assert.equal(row?.executes, false);
  });

  it("enqueues runScenario with the scenario id and does not collapse two scenarios", async () => {
    const site = await wbSite("gw_auto_run", tokenOf("n"));
    const first = await rpc(
      "createScenario",
      {
        name: "Первый шлюз",
        objectId: "obj_siyanie",
        trigger: "MANUAL",
        runtime: "gateway",
        steps: [{ deviceId: site.lamp.id, command: "setPower", value: true }],
      },
      objectAdmin,
    );
    const second = await rpc(
      "createScenario",
      {
        name: "Второй шлюз",
        objectId: "obj_siyanie",
        trigger: "MANUAL",
        runtime: "gateway",
        steps: [{ deviceId: site.lamp.id, command: "setPower", value: false }],
      },
      objectAdmin,
    );
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const a = (first.body as { id: string }).id;
    const b = (second.body as { id: string }).id;
    const ranA = await rpc("runScenario", { scenarioId: a }, objectAdmin);
    const ranB = await rpc("runScenario", { scenarioId: b }, objectAdmin);
    assert.equal(ranA.status, 200, JSON.stringify(ranA.body));
    assert.equal(ranB.status, 200, JSON.stringify(ranB.body));
    assert.equal((ranA.body as { confirmed?: boolean }).confirmed, false);
    const ops = await import("../../web/src/server/ops-store");
    const queued = ops.readOps().gatewayCommands.filter((item) => item.gatewayId === "gw_auto_run" && item.command === "runScenario" && item.status === "PENDING");
    assert.equal(queued.length, 2);
    assert.deepEqual([...queued.map((item) => item.deviceId)].sort(), [a, b].sort());
  });

  it("puts gateway scenarios and critical leak/fire rules into the pull pack", async () => {
    const token = tokenOf("p");
    const site = await wbSite("gw_auto_pack", token);
    const smoke: Device = {
      id: "gw_auto_pack_smoke",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
      kind: "SMOKE",
      name: "Дым авто",
      adapter: "wirenboard",
      gatewayId: site.gateway.id,
      externalId: "wb-smoke",
      capabilities: ["smoke"],
      metadata: { handedOver: true },
    };
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    file.devices.push(smoke);
    ops.writeOps(file);
    const created = await rpc(
      "createScenario",
      {
        name: "Пакет шлюза",
        objectId: "obj_siyanie",
        trigger: "EVENT",
        conditions: [{ deviceId: site.leak.id, field: "detected", value: true }],
        steps: [{ deviceId: site.lamp.id, command: "setPower", value: true }],
      },
      objectAdmin,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const channel = await import("../../web/src/server/gateway-channel");
    const pulled = channel.pullGateway(token);
    assert.equal(pulled.ok, true);
    if (!pulled.ok) return;
    const names = pulled.value.automations.scenarios.map((item) => item.id);
    assert.ok(names.includes((created.body as { id: string }).id));
    assert.ok(pulled.value.automations.critical.some((item) => item.id === "critical-leak"));
    assert.ok(pulled.value.automations.critical.some((item) => item.id === "critical-fire"));
  });

  it("ingests an automation run once by runId", async () => {
    const token = tokenOf("q");
    await wbSite("gw_auto_ingest", token);
    const channel = await import("../../web/src/server/gateway-channel");
    const first = channel.ingestAutomation(token, { runId: "rule:critical-leak:1", ruleId: "critical-leak", confirmed: true, at: new Date().toISOString() });
    const second = channel.ingestAutomation(token, { runId: "rule:critical-leak:1", ruleId: "critical-leak", confirmed: true });
    assert.equal(first.ok, true);
    assert.equal(first.ok && first.value.applied, true);
    assert.equal(second.ok && second.value.applied, false);
    const ops = await import("../../web/src/server/ops-store");
    assert.equal(ops.readOps().automationRuns.filter((item) => item.id === "rule:critical-leak:1").length, 1);
  });

  it("keeps the seed night scenario in the cloud", async () => {
    const list = (await rpc("listScenarios", {}, resident)).body as {
      scenarios: { id: string; runtime?: string; executes?: boolean }[];
    };
    const night = list.scenarios.find((item) => item.id === "scen_night_24");
    assert.equal(night?.runtime, "cloud");
    assert.equal(night?.executes, true);
  });
});
