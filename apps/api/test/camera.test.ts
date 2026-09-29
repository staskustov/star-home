import "./register-paths";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { afterEach, before, describe, it } from "node:test";
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
const security = { userId: "usr_security", membershipId: "mem_security_siyanie" };
const accountant = { userId: "usr_accountant", membershipId: "mem_accountant_star" };
const resident = { userId: "usr_stanislav", membershipId: "mem_stanislav_24" };

let rpc: (method: string, input: unknown, session: { userId: string; membershipId: string | null } | null) => Promise<Reply>;
let ingestCameraFrame: typeof import("../../web/src/server/camera-media").ingestCameraFrame;
let packCameras: typeof import("../../web/src/server/camera-media").packCameras;
let publicMedia: typeof import("../../web/src/server/camera-media").publicMedia;
let decodeJpeg: typeof import("../../web/src/server/camera-media").decodeJpeg;

before(async () => {
  rpc = (await import("../../web/src/server/rpc-handlers")).handleRpc;
  const cameras = await import("../../web/src/server/camera-media");
  ingestCameraFrame = cameras.ingestCameraFrame;
  packCameras = cameras.packCameras;
  publicMedia = cameras.publicMedia;
  decodeJpeg = cameras.decodeJpeg;
});

afterEach(() => {
  delete process.env.STAR_HOME_CAMERA_TIMEOUT_MS;
});

function jpegB64(size = 64): string {
  const bytes = Buffer.alloc(size, 0);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes.toString("base64");
}

function hashOf(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function cameraSite(id: string) {
  const ops = await import("../../web/src/server/ops-store");
  const file = ops.readOps();
  const gateway: Gateway = {
    id,
    companyId: "cmp_star",
    objectId: "obj_siyanie",
    unitId: null,
    name: "WB камеры",
    adapter: "wirenboard",
    status: "ONLINE",
    version: "agent-6",
    lastSeen: new Date().toISOString(),
    lastError: null,
    internalAddress: null,
    tokenHash: hashOf("c".repeat(48)),
  };
  const camera: Device = {
    id: `${id}_cam`,
    companyId: "cmp_star",
    objectId: "obj_siyanie",
    unitId: "unit_24",
    kind: "CAMERA",
    name: "Камера теста",
    adapter: "wirenboard",
    gatewayId: id,
    work: "ON",
    metadata: { handedOver: true },
  };
  file.gateways.push(gateway);
  file.devices.push(camera);
  ops.writeOps(file);
  return { gatewayId: id, deviceId: camera.id };
}

describe("stage 8 cameras", () => {
  it("keeps seed cameras unconfigured and does not confirm a frame", async () => {
    const reply = await rpc("cameraFrame", { objectId: "obj_siyanie", deviceId: "dev_camera_24" }, security);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const body = reply.body as { confirmed: boolean; hasFrame: boolean; message: string };
    assert.equal(body.confirmed, false);
    assert.equal(body.hasFrame, false);
    assert.match(body.message, /не подключена к потоку/i);
    assert.equal(JSON.stringify(body).includes("rtsp"), false);
    assert.equal("password" in body, false);
  });

  it("refuses the accountant and a camera taken out of service", async () => {
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", deviceId: "dev_camera_24" }, accountant)).status, 403);
    assert.equal((await rpc("updateCameraMedia", { deviceId: "dev_camera_24", protocol: "http-snapshot" }, accountant)).status, 403);
    assert.equal((await rpc("cameraFrame", { objectId: "obj_siyanie", deviceId: "dev_camera_wicket_24" }, security)).status, 409);
  });

  it("hides RTSP secrets from public list and home payloads", async () => {
    const { gatewayId, deviceId } = await cameraSite("gw_cam_public");
    const saved = await rpc(
      "updateCameraMedia",
      {
        deviceId,
        protocol: "rtsp",
        host: "192.168.1.20",
        port: 554,
        snapshotUrl: "http://192.168.1.20/snap.jpg",
        username: "cam",
        password: "secret-rtsp",
      },
      objectAdmin,
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const media = saved.body as Record<string, unknown>;
    assert.equal(media.hasPassword, true);
    assert.equal("password" in media, false);
    assert.equal(JSON.stringify(media).includes("secret-rtsp"), false);
    assert.equal(JSON.stringify(media).includes("rtsp://"), false);
    const listed = (await rpc("listDevices", { objectId: "obj_siyanie" }, objectAdmin)).body as {
      devices: { id: string; camera?: Record<string, unknown> | null }[];
    };
    const camera = listed.devices.find((item) => item.id === deviceId)?.camera;
    assert.ok(camera);
    assert.equal(camera.hasPassword, true);
    assert.equal("password" in camera, false);
    assert.equal(JSON.stringify(listed).includes("secret-rtsp"), false);
    assert.equal(JSON.stringify(listed).includes("rtsp://"), false);
    const published = publicMedia(deviceId);
    assert.equal(published?.hasPassword, true);
    assert.equal("password" in (published ?? {}), false);

    const packed = packCameras(gatewayId);
    assert.equal(packed.length, 1);
    assert.equal(packed[0]?.password, "secret-rtsp");
    assert.equal(packed[0]?.username, "cam");

    const home = ((await rpc("home", null, resident)).body as { home: { cameras: Record<string, unknown>[] } }).home;
    const card = home.cameras.find((item) => item.id === deviceId);
    assert.ok(card);
    assert.equal("password" in card, false);
    assert.equal("snapshotUrl" in card, false);
    assert.equal(JSON.stringify(home.cameras).includes("secret-rtsp"), false);
    assert.equal(JSON.stringify(home.cameras).includes("rtsp://"), false);
  });

  it("stores one last JPEG per camera and rejects non-jpeg", async () => {
    const { gatewayId, deviceId } = await cameraSite("gw_cam_ingest");
    const first = jpegB64(80);
    const second = jpegB64(96);
    assert.equal(ingestCameraFrame(gatewayId, { deviceId, jpeg: first }).applied, true);
    assert.equal(ingestCameraFrame(gatewayId, { deviceId, jpeg: second }).applied, true);
    assert.equal(ingestCameraFrame(gatewayId, { deviceId, jpeg: "not-jpeg" }).applied, false);
    assert.equal(ingestCameraFrame(gatewayId, { deviceId, jpeg: Buffer.from("hello").toString("base64") }).applied, false);
    const ops = await import("../../web/src/server/ops-store");
    const frames = ops.readOps().cameraFrames.filter((item) => item.deviceId === deviceId);
    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.bytes, second);
    assert.ok(decodeJpeg(second));
    assert.equal(decodeJpeg("AAAA"), null);
  });

  it("shows an object-level camera to the resident", async () => {
    const ops = await import("../../web/src/server/ops-store");
    const file = ops.readOps();
    file.devices.push({
      id: "dev_camera_street_object",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: null,
      place: "OBJECT",
      kind: "CAMERA",
      name: "Камера улицы объекта",
      adapter: "local",
      work: "ON",
    });
    ops.writeOps(file);
    const home = ((await rpc("home", null, resident)).body as { home: { cameras: { id?: string; name: string }[] } }).home;
    assert.ok(home.cameras.some((item) => item.id === "dev_camera_street_object"));
  });

  it("rejects snapshot URLs with credentials or without http", async () => {
    const { deviceId } = await cameraSite("gw_cam_url");
    assert.equal(
      (
        await rpc(
          "updateCameraMedia",
          { deviceId, protocol: "http-snapshot", host: "192.168.1.20", snapshotUrl: "rtsp://192.168.1.20/stream" },
          objectAdmin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await rpc(
          "updateCameraMedia",
          { deviceId, protocol: "http-snapshot", host: "192.168.1.20", snapshotUrl: "http://cam:pass@192.168.1.20/snap.jpg" },
          objectAdmin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await rpc(
          "updateCameraMedia",
          { deviceId, protocol: "http-snapshot", host: "cam@192.168.1.20", snapshotUrl: "http://192.168.1.20/snap.jpg" },
          objectAdmin,
        )
      ).status,
      400,
    );
  });
});
