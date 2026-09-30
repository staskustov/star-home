import { cloudExecutesAdapter } from "@/server/gateway-adapter";
import { enqueueGatewayCommand } from "@/server/gateway-queue";
import { appendAudit } from "@/server/audit-store";
import {
  findDevice,
  findGateway,
  projectCamerasOpen,
  readOps,
  writeOps,
  type CameraMedia,
  type CameraProtocol,
  type Device,
} from "@/server/ops-store";
import { can, objectFor, reaches, type StaffActor } from "@/server/rbac/decide";
import { householdCan } from "@/server/rbac/policy";
import { smartViewer, viewerReaches } from "@/server/smart-home";
import type { SessionRef } from "@/server/actor";
import { residentSeesDevice } from "@/server/device-kinds";

type Failure = { ok: false; status: number; message: string };
type Success<T> = { ok: true; value: T };
type Result<T> = Success<T> | Failure;

const denied: Failure = { ok: false, status: 403, message: "Нет доступа" };
export const cameraJpegMax = 400_000;

export type CameraPackItem = {
  deviceId: string;
  protocol: CameraProtocol;
  host: string;
  port?: number | null;
  path?: string | null;
  snapshotUrl?: string | null;
  username?: string | null;
  password?: string | null;
};

export type CameraPublicMedia = {
  protocol: CameraProtocol;
  host: string;
  port: number | null;
  path: string | null;
  snapshotUrl: string | null;
  username: string | null;
  hasPassword: boolean;
};

export function isJpegBytes(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function decodeJpeg(input: unknown): Buffer | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const raw = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input.trim();
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (bytes.length < 32 || bytes.length > cameraJpegMax || !isJpegBytes(bytes)) return null;
  return bytes;
}

export function mediaOf(deviceId: string): CameraMedia | undefined {
  return readOps().cameraMedia.find((item) => item.deviceId === deviceId);
}

export function frameOf(deviceId: string): { at: string; mime: "image/jpeg" } | undefined {
  const row = readOps().cameraFrames.find((item) => item.deviceId === deviceId);
  return row ? { at: row.at, mime: row.mime } : undefined;
}

export function publicMedia(deviceId: string): CameraPublicMedia | null {
  const media = mediaOf(deviceId);
  if (!media) return null;
  return {
    protocol: media.protocol,
    host: media.host,
    port: media.port ?? null,
    path: media.path ?? null,
    snapshotUrl: media.snapshotUrl ?? null,
    username: media.username ?? null,
    hasPassword: Boolean(media.password),
  };
}

export function cameraStreamState(device: Device): "live" | "snapshot" | "offline" | "unconfigured" {
  if (device.work === "OFF" || device.work === "FAULT") return "offline";
  const media = mediaOf(device.id);
  if (!media) return "unconfigured";
  const gateway = device.gatewayId ? findGateway(device.gatewayId) : undefined;
  if (!gateway || gateway.status === "OFFLINE" || cloudExecutesAdapter(gateway.adapter)) return "unconfigured";
  return frameOf(device.id) ? "snapshot" : "live";
}

export function packCameras(gatewayId: string): CameraPackItem[] {
  const file = readOps();
  const devices = file.devices.filter((device) => device.gatewayId === gatewayId && device.kind === "CAMERA" && device.status !== "REMOVED");
  return file.cameraMedia
    .filter((item) => devices.some((device) => device.id === item.deviceId))
    .map((item) => ({
      deviceId: item.deviceId,
      protocol: item.protocol,
      host: item.host,
      port: item.port ?? null,
      path: item.path ?? null,
      snapshotUrl: item.snapshotUrl ?? null,
      username: item.username ?? null,
      password: item.password ?? null,
    }));
}

export function ingestCameraFrame(
  gatewayId: string,
  input: { deviceId?: unknown; jpeg?: unknown; frame?: unknown; at?: unknown },
): { applied: boolean } {
  const deviceId = typeof input.deviceId === "string" ? input.deviceId : "";
  const jpeg = decodeJpeg(input.jpeg ?? input.frame);
  if (!deviceId || !jpeg) return { applied: false };
  const file = readOps();
  const device = file.devices.find((item) => item.id === deviceId && item.gatewayId === gatewayId);
  if (!device || device.kind !== "CAMERA") return { applied: false };
  const at = typeof input.at === "string" && input.at ? input.at : new Date().toISOString();
  file.cameraFrames = file.cameraFrames.filter((item) => item.deviceId !== deviceId);
  file.cameraFrames.unshift({ deviceId, gatewayId, at, mime: "image/jpeg", bytes: jpeg.toString("base64") });
  file.cameraFrames = file.cameraFrames.slice(0, 80);
  device.lastSeen = at;
  device.availability = "ONLINE";
  writeOps(file);
  return { applied: true };
}

function asProtocol(value: unknown): CameraProtocol | null {
  return value === "onvif" || value === "rtsp" || value === "http-snapshot" ? value : null;
}

function cleanHost(value: unknown): string | Failure {
  if (typeof value !== "string") return { ok: false, status: 400, message: "Укажите адрес камеры" };
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  if (!host || host.length > 120) return { ok: false, status: 400, message: "Укажите адрес камеры" };
  if (host.includes("@")) return { ok: false, status: 400, message: "Адрес без логина" };
  return host;
}

function cameraTimeoutMs(): number {
  const raw = Number(process.env.STAR_HOME_CAMERA_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 200) return Math.min(Math.round(raw), 20_000);
  return 8_000;
}

export function saveCameraMedia(
  actor: StaffActor,
  input: {
    deviceId?: unknown;
    protocol?: unknown;
    host?: unknown;
    port?: unknown;
    path?: unknown;
    snapshotUrl?: unknown;
    username?: unknown;
    password?: unknown;
  },
): Result<CameraPublicMedia> {
  if (!can(actor, "devices.edit")) return denied;
  if (typeof input.deviceId !== "string" || !input.deviceId) return { ok: false, status: 400, message: "Камера не найдена" };
  const file = readOps();
  const device = file.devices.find((item) => item.id === input.deviceId && item.companyId === actor.companyId);
  if (!device || device.kind !== "CAMERA") return { ok: false, status: 404, message: "Камера не найдена" };
  if (!reaches(actor, device)) return denied;
  const owned = objectFor(actor, device.objectId);
  if (!owned.ok) return owned;
  const protocol = asProtocol(input.protocol);
  if (!protocol) return { ok: false, status: 400, message: "Выберите протокол" };
  const host = cleanHost(input.host);
  if (typeof host !== "string") return host;
  const port = input.port === "" || input.port === null || input.port === undefined ? null : Number(input.port);
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { ok: false, status: 400, message: "Проверьте порт" };
  }
  const path = typeof input.path === "string" ? input.path.trim().slice(0, 200) : "";
  const snapshotUrl = typeof input.snapshotUrl === "string" ? input.snapshotUrl.trim().slice(0, 400) : "";
  if (protocol === "http-snapshot" && !snapshotUrl) return { ok: false, status: 400, message: "Укажите URL кадра" };
  if (snapshotUrl && !/^https?:\/\//i.test(snapshotUrl)) return { ok: false, status: 400, message: "URL кадра должен быть http(s)" };
  if (snapshotUrl.includes("@")) return { ok: false, status: 400, message: "URL кадра без логина" };
  const current = file.cameraMedia.find((item) => item.deviceId === device.id);
  const username = typeof input.username === "string" ? input.username.trim().slice(0, 80) : current?.username ?? "";
  const password =
    typeof input.password === "string" && input.password.length ? input.password.slice(0, 120) : current?.password ?? "";
  const next: CameraMedia = {
    deviceId: device.id,
    protocol,
    host,
    port,
    path: path || null,
    snapshotUrl: snapshotUrl || null,
    username: username || null,
    password: password || null,
  };
  file.cameraMedia = file.cameraMedia.filter((item) => item.deviceId !== device.id);
  file.cameraMedia.unshift(next);
  writeOps(file);
  appendAudit({
    actorUserId: actor.userId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "CAMERA_EDIT",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    reason: protocol,
  });
  return { ok: true, value: publicMedia(device.id)! };
}

function canViewCamera(session: SessionRef | null, device: Device): boolean {
  const viewer = smartViewer(session);
  if (!viewer.ok) return false;
  if (viewer.value.kind === "staff") {
    return can(viewer.value.actor, "security.camera.view") && reaches(viewer.value.actor, device);
  }
  return householdCan(viewer.value.place.role, "security.camera.view") && viewerReaches(viewer.value, device) && residentSeesDevice(device, { projectCameras: projectCamerasOpen(device.objectId) });
}

export async function requestCameraFrame(
  session: SessionRef | null,
  objectId: unknown,
  deviceId: unknown,
): Promise<Result<{ confirmed: boolean; message: string; hasFrame: boolean; frameUrl?: string }>> {
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, status: 400, message: "Камера не найдена" };
  const device = findDevice(deviceId);
  if (!device || device.kind !== "CAMERA") return { ok: false, status: 404, message: "Камера не найдена" };
  if (typeof objectId === "string" && objectId && device.objectId !== objectId) {
    return { ok: false, status: 404, message: "Камера не найдена" };
  }
  if (!canViewCamera(session, device)) return denied;
  if (device.work === "OFF" || device.work === "FAULT") {
    return { ok: false, status: 409, message: device.work === "OFF" ? "Камера выведена из работы" : "Камера неисправна" };
  }
  const viewer = smartViewer(session);
  const actorUserId = viewer.ok ? (viewer.value.kind === "staff" ? viewer.value.actor.userId : viewer.value.place.userId) : "";
  const media = mediaOf(device.id);
  const gateway = device.gatewayId ? findGateway(device.gatewayId) : undefined;
  if (!media || !gateway || cloudExecutesAdapter(gateway.adapter)) {
    appendAudit({
      actorUserId,
      companyId: device.companyId,
      objectId: device.objectId,
      unitId: device.unitId,
      action: "CAMERA_VIEW",
      targetType: "device",
      targetId: device.id,
      target: device.name,
      result: "ERROR",
      reason: "Нет потока",
    });
    return { ok: true, value: { confirmed: false, hasFrame: false, message: "Камера не подключена к потоку." } };
  }
  const queued = enqueueGatewayCommand({
    gatewayId: gateway.id,
    deviceId: device.id,
    command: "captureFrame",
    value: {
      protocol: media.protocol,
      host: media.host,
      port: media.port ?? null,
      path: media.path ?? null,
      snapshotUrl: media.snapshotUrl ?? null,
      username: media.username ?? null,
      password: media.password ?? null,
    },
  });
  let confirmed = false;
  if (gateway.status !== "OFFLINE") {
    const { waitForGatewayAck } = await import("@/server/device-commission");
    const waited = await waitForGatewayAck(queued.id, cameraTimeoutMs());
    confirmed = waited.status === "ACKED" && Boolean(frameOf(device.id));
  }
  const hasFrame = Boolean(frameOf(device.id));
  appendAudit({
    actorUserId,
    companyId: device.companyId,
    objectId: device.objectId,
    unitId: device.unitId,
    action: "CAMERA_VIEW",
    targetType: "device",
    targetId: device.id,
    target: device.name,
    result: confirmed ? "SUCCESS" : "ERROR",
    reason: confirmed ? "" : gateway.status === "OFFLINE" ? "Шлюз недоступен" : "Нет кадра",
  });
  return {
    ok: true,
    value: {
      confirmed,
      hasFrame,
      frameUrl: hasFrame ? `/api/smart-home/cameras/${device.id}/frame` : undefined,
      message: confirmed
        ? "Кадр получен."
        : gateway.status === "OFFLINE"
          ? "Шлюз недоступен. Кадр в очереди."
          : "Не удалось подтвердить кадр.",
    },
  };
}

export function readCameraJpeg(session: SessionRef | null, deviceId: unknown): Result<{ bytes: Buffer; mime: "image/jpeg"; at: string }> {
  if (typeof deviceId !== "string" || !deviceId) return { ok: false, status: 400, message: "Камера не найдена" };
  const device = findDevice(deviceId);
  if (!device || device.kind !== "CAMERA") return { ok: false, status: 404, message: "Камера не найдена" };
  if (!canViewCamera(session, device)) return denied;
  const row = readOps().cameraFrames.find((item) => item.deviceId === device.id);
  const jpeg = row ? decodeJpeg(row.bytes) : null;
  if (!row || !jpeg) return { ok: false, status: 409, message: "Кадр ещё не получен." };
  return { ok: true, value: { bytes: jpeg, mime: "image/jpeg", at: row.at } };
}
