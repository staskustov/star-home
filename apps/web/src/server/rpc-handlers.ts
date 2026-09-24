import { createHmac } from "crypto";
import { askFor, confirmFor } from "@/server/ai";
import type { AuditAction } from "@/server/audit-actions";
import { clientInfo, noteActor, withRequest } from "@/server/audit-context";
import { findObject } from "@/server/catalog-store";
import type { Membership } from "@/types/domain";
import type { SessionRef } from "@/server/actor";
import {
  createBuilding,
  createObject,
  createUnit,
  removeBuilding,
  removeObject,
  removeUnit,
  treeFor,
  updateObject,
} from "@/server/catalog";
import {
  adminMemberships,
  companyName,
  findMembership,
  findUserById,
  findUserByLogin,
  homeFor,
  homeMemberships,
  membershipsOf,
  placesFor,
} from "@/server/directory";
import { saveModeFor, settingsFor, switchModeFor } from "@/server/life-modes";
import { loginLimited, noteLoginFailure, noteLoginSuccess } from "@/server/login-limit";
import { homeSignals, readOps } from "@/server/ops-store";
import { deskFor, deskSections, isDeskSection, residentAccess, residentNotices } from "@/server/ops-view";
import {
  addPassFor,
  addRequestFor,
  alarmFor,
  cameraFrameFor,
  openGateFor,
  openObjectGateFor,
  openObjectPointFor,
  openPointFor,
  payFor,
  recordAudit,
  setRequestStatusFor,
} from "@/server/operations";
import { dashboardFor } from "@/server/dashboard";
import { verifyPassword } from "@/server/password";
import { updateUser } from "@/server/people-store";
import { can, staffActor, withPermission, type StaffActor } from "@/server/rbac/decide";
import type { Permission } from "@/server/rbac/permissions";
import { householdCan, selfOnlyOf } from "@/server/rbac/policy";
import { internalSecret } from "@/server/internal-secret";
import { rolesBoard, saveRole } from "@/server/roles";
import { checkPassFor, handleAlarmFor, securityPost } from "@/server/security-post";
import { engineeringBoard, pollDeviceFor, setDeviceWorkFor } from "@/server/engineering";
import { auditBoard, auditExport } from "@/server/audit-view";
import { adminObjectsFor, sectionsFor } from "@/server/rbac/sections";
import { record, text } from "@/server/schema";
import { addResident, removeResident, residentBoard } from "@/server/residents";
import { destinationFor, guardPath, initialMembershipId } from "@/server/routing";
import { addMember, changeAccess, editMember, removeMember, setMemberBlocked, teamBoard } from "@/server/team";
import { keepFile, storesFlushed } from "@/server/store-bind";

type Reply = { status: number; body: unknown };

type PushRow = { userId: string; endpoint: string; p256dh: string; auth: string };

const runtime = globalThis as typeof globalThis & {
  __starSavePush?: (row: PushRow) => Promise<void>;
};

function ok(body: unknown, status = 200): Reply {
  return { status, body };
}

function fail(status: number, message: string): Reply {
  return { status, body: { message } };
}

function asReply(result: { ok: true; value: unknown } | { ok: false; status: number; message: string }, status = 200): Reply {
  if (!result.ok) return fail(result.status, result.message);
  return ok(result.value, status);
}

function expired(expiresAt?: string | null): boolean {
  return Boolean(expiresAt) && Date.parse(expiresAt ?? "") <= Date.now();
}

function liveSession(session: SessionRef | null): SessionRef | null {
  if (!session) return null;
  const user = findUserById(session.userId);
  if (!user || user.status === "BLOCKED") return null;
  if ((user.sessionVersion ?? 1) !== (session.sv ?? 1)) return null;
  return { userId: session.userId, membershipId: session.membershipId, sv: session.sv ?? 1 };
}

export async function handleRpc(method: string, input: unknown, session: SessionRef | null, client?: unknown): Promise<Reply> {
  return withRequest(clientInfo(client), async () => {
    const result = await dispatch(method, input, liveSession(session));
    await storesFlushed();
    return result;
  });
}

type Result = { ok: true; value: unknown } | { ok: false; status: number; message: string };
type Input = Record<string, unknown>;
type Route =
  | { access: "public"; run: (input: unknown) => Reply | Promise<Reply> }
  | { access: "session"; run: (session: SessionRef, input: unknown) => Reply | Promise<Reply> }
  | { access: "staff"; permission: Permission; run: (actor: StaffActor, input: Input) => Reply | Promise<Reply> };

function staff(permission: Permission, run: (actor: StaffActor, input: Input) => Result | Promise<Result>, status = 200): Route {
  return { access: "staff", permission, run: async (actor, input) => asReply(await run(actor, input), status) };
}

function session(run: (session: SessionRef, input: Input) => Reply | Promise<Reply>): Route {
  return { access: "session", run: (current, input) => run(current, record(input) ?? {}) };
}

function household(run: (session: SessionRef, input: Input) => Result | Promise<Result>): Route {
  return session(async (current, input) => asReply(await run(current, input)));
}

const methodPolicy: Record<string, Route> = {
  login: { access: "public", run: login },
  pushKey: { access: "public", run: () => ok({ publicKey: process.env.STAR_HOME_VAPID_PUBLIC ?? "" }) },

  destination: session((current) => ok({ redirectTo: destinationFor(current.userId, current.membershipId) })),
  guard: session((current, input) => ok(guardPath(current.userId, current.membershipId, typeof input.pathname === "string" ? input.pathname : "/"))),
  switch: session(switched),
  places: session(places),
  profile: session(profile),
  admin: session(admin),
  subscribe: session(subscribe),
  liveToken: session(liveToken),

  home: session(home),
  guest: session(guest),
  access: session(access),
  requests: session(requests),
  addRequest: session(addRequest),
  openGate: household((current) => openGateFor(current)),
  openPoint: household((current, input) => openPointFor(current, input.pointId)),
  addPass: household((current, input) => addPassFor(current, input.guestName, input.detail, input.vehicle)),
  pay: household((current) => payFor(current)),
  alarm: household((current) => alarmFor(current)),
  ask: household((current, input) => askFor(current, input.prompt)),
  confirm: household((current, input) => confirmFor(current, input.token)),
  switchMode: household((current, input) => switchModeFor(current, input.mode)),

  dashboard: staff("dashboard.view", (actor) => ({ ok: true, value: dashboardFor(actor) })),
  desk: staff("dashboard.view", desk),
  team: staff("users.view", (actor) => ({ ok: true, value: teamBoard(actor) })),
  teamAdd: staff("users.create", addMember, 201),
  teamEdit: staff("users.edit", editMember),
  teamAccess: staff("users.view", changeAccess),
  teamBlock: staff("users.block", (actor, input) => setMemberBlocked(actor, input, true)),
  teamRestore: staff("users.block", (actor, input) => setMemberBlocked(actor, input, false)),
  teamRemove: staff("users.delete", removeMember),
  roles: staff("roles.view", (actor) => ({ ok: true, value: rolesBoard(actor) })),
  rolesSave: staff("roles.edit", saveRole),
  audit: staff("audit.view", (actor, input) => ({ ok: true, value: auditBoard(actor, input) })),
  auditExport: staff("audit.export", auditExport),

  tree: staff("objects.view", tree),
  createObject: staff("objects.create", (actor, input) => createObject(actor, { name: input.name, type: input.type, address: input.address }), 201),
  updateObject: staff("objects.edit", (actor, input) => updateObject(actor, text(input.objectId, 1, 80) ?? "", { name: input.name, address: input.address })),
  removeObject: staff("objects.delete", (actor, input) => removeObject(actor, text(input.objectId, 1, 80) ?? "")),
  createBuilding: staff("objects.structure.edit", (actor, input) => createBuilding(actor, text(input.objectId, 1, 80) ?? "", input.name), 201),
  removeBuilding: staff("objects.structure.edit", (actor, input) => removeBuilding(actor, text(input.buildingId, 1, 80) ?? "")),
  createUnit: staff("objects.structure.edit", (actor, input) => createUnit(actor, text(input.objectId, 1, 80) ?? "", { name: input.name, buildingId: input.buildingId }), 201),
  removeUnit: staff("objects.structure.edit", (actor, input) => removeUnit(actor, text(input.unitId, 1, 80) ?? "")),

  residents: staff("residents.view", (actor) => ({ ok: true, value: residentBoard(actor) })),
  addResident: staff("residents.create", (actor, input) => addResident(actor, input as never), 201),
  removeResident: staff("residents.delete", (actor, input) => removeResident(actor, text(input.membershipId, 1, 80) ?? "")),

  settings: staff("settings.view", (actor) => ({ ok: true, value: settingsFor(actor) })),
  saveMode: staff("settings.edit", (actor, input) => saveModeFor(actor, { objectId: input.objectId, setting: record(input.setting) ?? null })),

  openObjectGate: staff("access.gate.open", (actor, input) => openObjectGateFor(actor, input.objectId)),
  cameraFrame: staff("security.camera.view", (actor, input) => cameraFrameFor(actor, input.objectId, input.name)),
  securityPost: staff("security.view", (actor, input) => securityPost(actor, input.objectId)),
  handleAlarm: staff("security.alarm.handle", (actor, input) => handleAlarmFor(actor, input.alarmId, input.step)),
  openObjectPoint: staff("access.gate.open", (actor, input) => openObjectPointFor(actor, input.objectId, input.pointId)),
  checkPass: staff("access.view", (actor, input) => checkPassFor(actor, input.objectId, input.code)),
  engineering: staff("engineering.view", (actor) => engineeringBoard(actor)),
  pollDevice: staff("engineering.command", (actor, input) => pollDeviceFor(actor, input.objectId, input.deviceId)),
  setDeviceWork: staff("engineering.edit", (actor, input) => setDeviceWorkFor(actor, input.objectId, input.deviceId, input.work)),
  setRequestStatus: staff("service.edit", (actor, input) => setRequestStatusFor(actor, input.id, input.status, input.objectId)),
};

export const rpcMethods: readonly string[] = Object.keys(methodPolicy);

export const rpcAccess: Readonly<Record<string, { access: Route["access"]; permission: Permission | null }>> = Object.fromEntries(
  Object.entries(methodPolicy).map(([method, route]) => [method, { access: route.access, permission: route.access === "staff" ? route.permission : null }]),
);

const guardedMethods: Partial<Record<string, AuditAction>> = {
  teamAdd: "TEAM_ADD",
  teamEdit: "TEAM_EDIT",
  teamAccess: "TEAM_ROLE",
  teamBlock: "TEAM_BLOCK",
  teamRestore: "TEAM_RESTORE",
  teamRemove: "TEAM_REMOVE",
  rolesSave: "ROLES_EDIT",
  createObject: "OBJECT_CREATE",
  updateObject: "OBJECT_EDIT",
  removeObject: "OBJECT_DELETE",
  createBuilding: "BUILDING_CREATE",
  removeBuilding: "BUILDING_DELETE",
  createUnit: "UNIT_CREATE",
  removeUnit: "UNIT_DELETE",
  addResident: "RESIDENT_ADD",
  removeResident: "RESIDENT_REMOVE",
  saveMode: "MODE_SETTINGS",
  switchMode: "MODE_SWITCH",
  openObjectGate: "OPEN_GATE",
  openGate: "OPEN_GATE",
  openPoint: "OPEN_GATE",
  cameraFrame: "CAMERA_VIEW",
  handleAlarm: "ALARM_CLOSE",
  openObjectPoint: "OPEN_GATE",
  pollDevice: "DEVICE_POLL",
  setDeviceWork: "DEVICE_STATUS",
  setRequestStatus: "UPDATE_REQUEST",
  addPass: "CREATE_PASS",
  pay: "PAY_INVOICE",
  alarm: "RAISE_ALARM",
  auditExport: "AUDIT_EXPORT",
};

const denialWindowMs = 60_000;
const denialsPerWindow = 10;
const denials = new Map<string, { count: number; resetAt: number }>();

function denialAllowed(userId: string, method: string, now = Date.now()): boolean {
  const key = `${userId}:${method}`;
  const current = denials.get(key);
  if (!current || current.resetAt <= now) {
    if (denials.size > 10_000) denials.clear();
    denials.set(key, { count: 1, resetAt: now + denialWindowMs });
    return true;
  }
  current.count += 1;
  return current.count <= denialsPerWindow;
}

function noteDenial(method: string, input: unknown, current: SessionRef, companyId: string | null, membership: Membership | undefined, reply: Reply): Reply {
  const action = guardedMethods[method];
  if (reply.status !== 403 || !action || !companyId || !denialAllowed(current.userId, method)) return reply;
  const body = record(input);
  const asked = typeof body?.objectId === "string" ? findObject(body.objectId) : undefined;
  const object = asked?.companyId === companyId ? asked : undefined;
  const own = membership?.companyId === companyId ? membership : undefined;
  recordAudit({
    actorUserId: current.userId,
    companyId,
    objectId: object?.id ?? own?.objectId ?? null,
    buildingId: object ? null : (own?.buildingId ?? null),
    unitId: object ? null : (own?.unitId ?? null),
    action,
    targetType: "method",
    targetId: method,
    target: object?.name ?? "Запрос отклонён",
    result: "DENIED",
    reason: (reply.body as { message?: string } | null)?.message ?? "Нет доступа",
  });
  return reply;
}

async function dispatch(method: string, input: unknown, current: SessionRef | null): Promise<Reply> {
  const route = Object.hasOwn(methodPolicy, method) ? methodPolicy[method] : undefined;
  if (!route) return fail(404, "Неизвестный метод");
  if (route.access === "public") return route.run(input);
  if (!current) return fail(401, "Нужно войти");
  const membership = current.membershipId ? findMembership(current.userId, current.membershipId) : undefined;
  if (membership) noteActor({ userId: current.userId, role: membership.role, membershipId: membership.id });
  if (route.access === "session") {
    return noteDenial(method, input, current, membership?.companyId ?? null, membership, await route.run(current, input));
  }
  const built = staffActor(current);
  if (built.ok) noteActor({ userId: current.userId, role: built.value.role, membershipId: built.value.membershipId });
  const actor = withPermission(built, route.permission);
  const reply = actor.ok ? await route.run(actor.value, record(input) ?? {}) : fail(actor.status, actor.message);
  return noteDenial(method, input, current, built.ok ? built.value.companyId : (membership?.companyId ?? null), membership, reply);
}

function noteLogin(user: { id: string }, result: "SUCCESS" | "DENIED", reason = "", membershipId: string | null = null): void {
  const memberships = membershipsOf(user.id);
  const chosen = memberships.find((item) => item.id === membershipId) ?? memberships[0];
  if (!chosen) return;
  recordAudit({
    actorUserId: user.id,
    actorRole: chosen.role,
    companyId: chosen.companyId,
    objectId: chosen.objectId,
    buildingId: chosen.buildingId ?? null,
    unitId: chosen.unitId,
    action: result === "SUCCESS" ? "LOGIN" : "LOGIN_FAILED",
    targetType: "user",
    targetId: user.id,
    target: result === "SUCCESS" ? "Вход в STAR HOME" : "Попытка входа",
    result,
    reason,
  });
}

async function login(input: unknown): Promise<Reply> {
  const body = record(input);
  const loginName = text(body?.login, 1, 80) ?? "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!loginName || password.length < 1 || password.length > 200) return fail(400, "Введите логин и пароль");
  const user = findUserByLogin(loginName);
  if (await loginLimited(loginName)) {
    if (user) noteLogin(user, "DENIED", "Слишком много попыток");
    return fail(429, "Слишком много попыток. Подождите немного.");
  }
  const matches = user ? verifyPassword(password, user.passwordHash) : verifyPassword(password, "missing.missing");
  if (!user || !matches) {
    await noteLoginFailure(loginName);
    if (user) noteLogin(user, "DENIED", "Неверный пароль");
    return fail(401, "Неверный логин или пароль");
  }
  if (user.status === "BLOCKED") {
    noteLogin(user, "DENIED", "Доступ приостановлен");
    return fail(403, "Доступ приостановлен. Обратитесь к администратору.");
  }
  await noteLoginSuccess(loginName);
  updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const membershipId = initialMembershipId(user.id);
  noteLogin(user, "SUCCESS", "", membershipId);
  return ok({ userId: user.id, membershipId, sessionVersion: user.sessionVersion ?? 1, redirectTo: destinationFor(user.id, membershipId) });
}

function switched(session: SessionRef, input: Input): Reply {
  const membershipId = input.membershipId;
  if (typeof membershipId !== "string" || !membershipId) return fail(400, "Нет доступа");
  const membership = findMembership(session.userId, membershipId);
  if (!membership || expired(membership.expiresAt)) return fail(403, "Нет доступа");
  return ok({ membershipId: membership.id, redirectTo: destinationFor(session.userId, membership.id) });
}

function home(session: SessionRef): Reply {
  const user = findUserById(session.userId);
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!user || !membership || expired(membership.expiresAt) || !householdCan(membership.role, "home.view")) {
    return ok({ redirect: destinationFor(session.userId, null) });
  }
  const base = homeFor(user, membership);
  if (!base) return ok({ redirect: destinationFor(session.userId, null) });
  const signals = homeSignals(base.unit.id, base.object.id);
  const pays = householdCan(membership.role, "payments.pay");
  const bills = householdCan(membership.role, "payments.view");
  const ownRequestsOnly = selfOnlyOf(membership.role).has("service.view");
  return ok({
    home: {
      ...base,
      quickActions: base.quickActions.filter((action) => pays || action.id !== "pay"),
      balance: bills ? signals.balance : null,
      climate: signals.climate,
      visitor: signals.visitor,
      todayEvent: signals.today,
      todayRequest:
        signals.request && (!ownRequestsOnly || signals.request.authorUserId === session.userId)
          ? { title: signals.request.title, detail: signals.request.detail }
          : null,
      paymentHistory: bills ? signals.payments : [],
      categories: signals.categories,
      rooms: base.unit.type === "HOUSE" ? [{ name: "Гостиная" }, { name: "Спальня" }, { name: "Детская" }, { name: "Кабинет" }, { name: "Котельная" }] : [],
      cameras: signals.cameras,
      devices: signals.devices,
      meters: signals.meters,
    },
  });
}

function places(session: SessionRef): Reply {
  const user = findUserById(session.userId);
  if (!user) return fail(401, "Нужно войти");
  const list = placesFor(session.userId);
  if (list.length < 2) return ok({ redirect: destinationFor(session.userId, session.membershipId) });
  return ok({ name: user.name, places: list });
}

function profile(session: SessionRef): Reply {
  const user = findUserById(session.userId);
  if (!user) return fail(401, "Нужно войти");
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const view = membership ? homeFor(user, membership) : null;
  const admin = adminMemberships(session.userId)[0];
  return ok({
    name: user.name,
    place: view ? `${view.object.name} · ${view.unit.name}` : null,
    choosePlaces: homeMemberships(session.userId).length > 1,
    adminMembershipId: admin?.id ?? null,
    notices: residentNotices(session.userId),
  });
}

function guest(session: SessionRef): Reply {
  const user = findUserById(session.userId);
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!user || !membership || !householdCan(membership.role, "guest.pass.view") || expired(membership.expiresAt) || !membership.passId) {
    return ok({ redirect: destinationFor(session.userId, session.membershipId) });
  }
  const pass = readOps().passes.find((item) => item.id === membership.passId);
  return ok({ name: user.name, pass: pass ? { guestName: pass.guestName, detail: pass.detail, code: pass.code } : null });
}

function admin(session: SessionRef): Reply {
  const user = findUserById(session.userId);
  const actor = staffActor(session);
  if (!actor.ok || !user) return ok({ redirect: destinationFor(session.userId, session.membershipId) });
  return ok({
    companyName: companyName(actor.value.companyId),
    actorLabel: user.name,
    objects: adminObjectsFor(actor.value),
    sections: sectionsFor(actor.value),
    permissions: [...actor.value.permissions],
  });
}

function desk(actor: StaffActor, input: Input): Result {
  if (!isDeskSection(input.section)) return { ok: false, status: 404, message: "Раздел не найден" };
  if (!can(actor, deskSections[input.section])) return { ok: false, status: 403, message: "Нет доступа" };
  return { ok: true, value: deskFor(actor, input.section) };
}

function access(session: SessionRef): Reply {
  const view = home(session);
  const body = view.body as { redirect?: string; home?: { unit: { id: string; name: string }; object: { id: string; name: string } } };
  if (!body.home || !session.membershipId) return view;
  const membership = findMembership(session.userId, session.membershipId);
  return ok({
    place: `${body.home.object.name} · ${body.home.unit.name}`,
    canCreate: Boolean(membership && householdCan(membership.role, "access.pass.create")),
    ...residentAccess(body.home.unit.id, body.home.object.id),
  });
}

function requests(session: SessionRef): Reply {
  const view = home(session);
  const body = view.body as { home?: { unit: { id: string }; serviceCategories: string[] } };
  if (!body.home) return view;
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const ownOnly = !membership || selfOnlyOf(membership.role).has("service.view");
  const rows = readOps()
    .requests.filter((request) => request.unitId === body.home?.unit.id)
    .filter((request) => !ownOnly || request.authorUserId === session.userId)
    .map((request) => ({ id: request.id, category: request.category, text: request.text, status: request.status }));
  return ok({ categories: body.home.serviceCategories, requests: rows });
}

function tree(actor: StaffActor, input: Input): Result {
  return treeFor(actor, typeof input.objectId === "string" ? input.objectId : "");
}

async function addRequest(session: SessionRef, input: Input): Promise<Reply> {
  let fileName: string | undefined;
  if (typeof input.fileName === "string" && input.fileName && typeof input.fileBase64 === "string" && input.fileBase64) {
    const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
    if (!membership || !householdCan(membership.role, "service.create")) return fail(403, "Нет доступа");
    const bytes = Buffer.from(input.fileBase64, "base64");
    if (bytes.length > 1_000_000) return fail(400, "Файл слишком большой");
    const stored = await keepFile({ companyId: membership.companyId, name: input.fileName, bytes });
    fileName = stored ?? undefined;
  }
  const result = await addRequestFor(session, input.category, input.text, fileName);
  if (!result.ok) return fail(result.status, result.message);
  return ok({ id: result.value.id, status: result.value.status });
}

async function subscribe(session: SessionRef, input: Input): Promise<Reply> {
  if (typeof input.endpoint !== "string" || typeof input.p256dh !== "string" || typeof input.auth !== "string") {
    return fail(400, "Не удалось сохранить уведомление");
  }
  await runtime.__starSavePush?.({ userId: session.userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth });
  return ok({ saved: true });
}

function liveToken(session: SessionRef): Reply {
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const objectId = membership && !expired(membership.expiresAt) ? membership.objectId : "";
  if (!objectId) return fail(403, "Нет доступа");
  const exp = Date.now() + 60_000;
  const body = Buffer.from(JSON.stringify({ userId: session.userId, objectId, exp })).toString("base64url");
  const signature = createHmac("sha256", internalSecret()).update(body).digest("base64url");
  return ok({ token: `${body}.${signature}`, objectId });
}
