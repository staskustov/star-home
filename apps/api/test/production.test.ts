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
const accountant = { userId: "usr_accountant", membershipId: "mem_accountant_star" };

let rpc: (method: string, input: unknown, session: { userId: string; membershipId: string | null } | null) => Promise<Reply>;

before(async () => {
  rpc = (await import("../../web/src/server/rpc-handlers")).handleRpc;
});

afterEach(() => {
  delete process.env.STAR_HOME_ALLOW_RESTORE;
});

describe("stage 9 production readiness", () => {
  it("exports snapshots without the pairing token and refuses accountants", async () => {
    const created = await rpc("createGateway", { objectId: "obj_siyanie", name: "WB backup", adapter: "wirenboard" }, admin);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const gatewayId = (created.body as { id: string }).id;
    const paired = await rpc("pairGateway", { gatewayId }, admin);
    assert.equal(paired.status, 200, JSON.stringify(paired.body));
    const token = (paired.body as { token: string }).token;
    assert.ok(token.length > 20);
    const dumped = await rpc("exportBackup", {}, admin);
    assert.equal(dumped.status, 200, JSON.stringify(dumped.body));
    const body = dumped.body as {
      kind: string;
      names: string[];
      snapshots: { ops: { gateways: { id: string; tokenHash?: string | null }[] }; people: { users: { passwordHash?: string }[] } };
    };
    assert.equal(body.kind, "star-home-backup");
    assert.deepEqual(body.names, ["catalog", "people", "ops", "life", "audit"]);
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(token), false);
    assert.ok(body.snapshots.people.users.some((user) => Boolean(user.passwordHash)));
    const gateway = body.snapshots.ops.gateways.find((item) => item.id === gatewayId);
    assert.ok(gateway?.tokenHash);
    assert.notEqual(gateway.tokenHash, token);
    const listed = (await rpc("listGateways", { objectId: "obj_siyanie" }, objectAdmin)).body as { gateways: Record<string, unknown>[] };
    const publicGw = listed.gateways.find((item) => item.id === gatewayId);
    assert.ok(publicGw);
    assert.equal("tokenHash" in publicGw, false);
    assert.equal((await rpc("exportBackup", {}, accountant)).status, 403);
    assert.equal((await rpc("exportBackup", {}, objectAdmin)).status, 403);
  });

  it("restores only with an explicit phrase and the restore flag", async () => {
    const { restoreAllowed } = await import("../../web/src/server/ops-backup");
    assert.equal(restoreAllowed(), false);
    const dumped = await rpc("exportBackup", {}, admin);
    assert.equal(dumped.status, 200);
    const backup = dumped.body as { snapshots: { ops: { devices: { id: string; name: string }[] } } };
    const camera = backup.snapshots.ops.devices.find((item) => item.id === "dev_camera_24");
    assert.ok(camera);
    camera.name = "Камера из снимка";
    assert.equal((await rpc("restoreBackup", { confirm: "RESTORE", backup: dumped.body }, admin)).status, 403);
    process.env.STAR_HOME_ALLOW_RESTORE = "1";
    assert.equal((await rpc("restoreBackup", { confirm: "NO", backup: dumped.body }, admin)).status, 400);
    const restored = await rpc("restoreBackup", { confirm: "RESTORE", backup: dumped.body }, admin);
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    const ops = await import("../../web/src/server/ops-store");
    assert.equal(ops.readOps().devices.find((item) => item.id === "dev_camera_24")?.name, "Камера из снимка");
    assert.equal((await rpc("restoreBackup", { confirm: "RESTORE", backup: dumped.body }, accountant)).status, 403);
  });
});
