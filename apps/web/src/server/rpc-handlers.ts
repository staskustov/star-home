import { createHmac } from "crypto";
import { askFor, confirmFor } from "@/server/ai";
import type { SessionRef } from "@/server/actor";
import {
  actorFromSession,
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
  adminObjectsFor,
  companyName,
  findMembership,
  findUserById,
  findUserByLogin,
  homeFor,
  homeMemberships,
  isAdminRole,
  placesFor,
} from "@/server/directory";
import { saveModeFor, settingsFor, switchModeFor } from "@/server/life-modes";
import { loginLimited, noteLoginFailure, noteLoginSuccess } from "@/server/login-limit";
import { homeSignals, readOps } from "@/server/ops-store";
import { companyOps, residentAccess, residentNotices } from "@/server/ops-view";
import {
  addPassFor,
  addRequestFor,
  alarmFor,
  cameraFrameFor,
  openGateFor,
  openObjectGateFor,
  openPointFor,
  payFor,
  setRequestStatusFor,
} from "@/server/operations";
import { verifyPassword } from "@/server/password";
import { record, text } from "@/server/schema";
import { addResident, removeResident, residentBoard } from "@/server/residents";
import { destinationFor, guardPath, initialMembershipId } from "@/server/routing";
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

export async function handleRpc(method: string, input: unknown, session: SessionRef | null): Promise<Reply> {
  const result = await dispatch(method, input, session);
  await storesFlushed();
  return result;
}

async function dispatch(method: string, input: unknown, session: SessionRef | null): Promise<Reply> {
  if (method === "login") return login(input);
  if (method === "destination") {
    if (!session) return fail(401, "Нужно войти");
    return ok({ redirectTo: destinationFor(session.userId, session.membershipId) });
  }
  if (method === "guard") {
    if (!session) return fail(401, "Нужно войти");
    const pathname = typeof (input as { pathname?: unknown } | null)?.pathname === "string" ? (input as { pathname: string }).pathname : "/";
    return ok(guardPath(session.userId, session.membershipId, pathname));
  }
  if (method === "switch") return switched(session, input);
  if (method === "home") return home(session);
  if (method === "places") return places(session);
  if (method === "profile") return profile(session);
  if (method === "guest") return guest(session);
  if (method === "admin") return admin(session);
  if (method === "ops") return ops(session);
  if (method === "access") return access(session);
  if (method === "requests") return requests(session);
  if (method === "tree") return tree(session, input);
  if (method === "residents") return residents(session);
  if (method === "settings") return settings(session);
  if (method === "pushKey") return ok({ publicKey: process.env.STAR_HOME_VAPID_PUBLIC ?? "" });
  if (method === "subscribe") return subscribe(session, input);
  if (method === "liveToken") return liveToken(session);
  if (method === "openGate") return asReply(await openGateFor(session));
  if (method === "openPoint") return asReply(await openPointFor(session, (input as { pointId?: unknown } | null)?.pointId));
  if (method === "openObjectGate") return asReply(await openObjectGateFor(session, (input as { objectId?: unknown } | null)?.objectId));
  if (method === "addPass") {
    const body = input as { guestName?: unknown; detail?: unknown; vehicle?: unknown } | null;
    return asReply(await addPassFor(session, body?.guestName, body?.detail, body?.vehicle));
  }
  if (method === "addRequest") return addRequest(session, input);
  if (method === "setRequestStatus") {
    const body = input as { id?: string; status?: unknown; objectId?: unknown } | null;
    return asReply(await setRequestStatusFor(session, body?.id ?? "", body?.status, body?.objectId));
  }
  if (method === "pay") return asReply(await payFor(session));
  if (method === "alarm") return asReply(await alarmFor(session));
  if (method === "cameraFrame") {
    const body = input as { objectId?: unknown; name?: unknown } | null;
    return asReply(await cameraFrameFor(session, body?.objectId, body?.name));
  }
  if (method === "ask") return asReply(await askFor(session, (input as { prompt?: unknown } | null)?.prompt));
  if (method === "confirm") return asReply(await confirmFor(session, (input as { token?: unknown } | null)?.token));
  if (method === "switchMode") return asReply(switchModeFor(session, (input as { mode?: unknown } | null)?.mode));
  if (method === "saveMode") return asReply(saveModeFor(session, input as { objectId: unknown; setting: null }));
  if (method === "createObject") return mutate(session, input, "createObject");
  if (method === "updateObject") return mutate(session, input, "updateObject");
  if (method === "removeObject") return mutate(session, input, "removeObject");
  if (method === "createBuilding") return mutate(session, input, "createBuilding");
  if (method === "removeBuilding") return mutate(session, input, "removeBuilding");
  if (method === "createUnit") return mutate(session, input, "createUnit");
  if (method === "removeUnit") return mutate(session, input, "removeUnit");
  if (method === "addResident") return person(session, input, "add");
  if (method === "removeResident") return person(session, input, "remove");
  return fail(404, "Неизвестный метод");
}

async function login(input: unknown): Promise<Reply> {
  const body = record(input);
  const loginName = text(body?.login, 1, 80) ?? "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!loginName || password.length < 1 || password.length > 200) return fail(400, "Введите логин и пароль");
  if (await loginLimited(loginName)) return fail(429, "Слишком много попыток. Подождите немного.");
  const user = findUserByLogin(loginName);
  const matches = user ? verifyPassword(password, user.passwordHash) : verifyPassword(password, "missing.missing");
  if (!user || !matches) {
    await noteLoginFailure(loginName);
    return fail(401, "Неверный логин или пароль");
  }
  await noteLoginSuccess(loginName);
  const membershipId = initialMembershipId(user.id);
  return ok({ userId: user.id, membershipId, redirectTo: destinationFor(user.id, membershipId) });
}

function switched(session: SessionRef | null, input: unknown): Reply {
  if (!session) return fail(401, "Нужно войти");
  const membershipId = (input as { membershipId?: unknown } | null)?.membershipId;
  if (typeof membershipId !== "string" || !membershipId) return fail(400, "Нет доступа");
  const membership = findMembership(session.userId, membershipId);
  if (!membership || expired(membership.expiresAt)) return fail(403, "Нет доступа");
  return ok({ membershipId: membership.id, redirectTo: destinationFor(session.userId, membership.id) });
}

function home(session: SessionRef | null): Reply {
  if (!session) return fail(401, "Нужно войти");
  const user = findUserById(session.userId);
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!user || !membership || expired(membership.expiresAt)) return ok({ redirect: destinationFor(session.userId, null) });
  const base = homeFor(user, membership);
  if (!base) return ok({ redirect: destinationFor(session.userId, null) });
  const signals = homeSignals(base.unit.id, base.object.id);
  const quickActions = base.quickActions.filter((action) => membership.role === "RESIDENT" || action.id !== "pay");
  return ok({
    home: {
      ...base,
      quickActions,
      balance: membership.role === "RESIDENT" ? signals.balance : null,
      climate: signals.climate,
      visitor: signals.visitor,
      todayEvent: signals.today,
      todayRequest:
        signals.request && (membership.role !== "FAMILY_MEMBER" || signals.request.authorUserId === session.userId)
          ? { title: signals.request.title, detail: signals.request.detail }
          : null,
      paymentHistory: membership.role === "RESIDENT" ? signals.payments : [],
      categories: signals.categories,
      meters: signals.meters,
    },
  });
}

function places(session: SessionRef | null): Reply {
  if (!session) return fail(401, "Нужно войти");
  const user = findUserById(session.userId);
  if (!user) return fail(401, "Нужно войти");
  const list = placesFor(session.userId);
  if (list.length < 2) return ok({ redirect: destinationFor(session.userId, session.membershipId) });
  return ok({ name: user.name, places: list });
}

function profile(session: SessionRef | null): Reply {
  if (!session) return fail(401, "Нужно войти");
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

function guest(session: SessionRef | null): Reply {
  if (!session) return fail(401, "Нужно войти");
  const user = findUserById(session.userId);
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  if (!user || membership?.role !== "GUEST" || expired(membership.expiresAt) || !membership.passId) {
    return ok({ redirect: destinationFor(session.userId, session.membershipId) });
  }
  const pass = readOps().passes.find((item) => item.id === membership.passId);
  return ok({ name: user.name, pass: pass ? { guestName: pass.guestName, detail: pass.detail, code: pass.code } : null });
}

function admin(session: SessionRef | null): Reply {
  if (!session) return fail(401, "Нужно войти");
  const actor = actorFromSession(session);
  const user = findUserById(session.userId);
  const admins = adminMemberships(session.userId);
  const selected = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const membership = selected && isAdminRole(selected.role) ? selected : admins[0];
  if (!actor.ok || !user || !membership) return ok({ redirect: destinationFor(session.userId, session.membershipId) });
  return ok({
    companyName: companyName(membership.companyId),
    actorLabel: user.name,
    objects: adminObjectsFor(membership),
  });
}

function ops(session: SessionRef | null): Reply {
  const actor = actorFromSession(session);
  if (!actor.ok) return fail(actor.status, actor.message);
  return ok(companyOps(actor.value.companyId));
}

function access(session: SessionRef | null): Reply {
  const view = home(session);
  const body = view.body as { redirect?: string; home?: { unit: { id: string; name: string }; object: { id: string; name: string } } };
  if (!body.home || !session?.membershipId) return view;
  const membership = findMembership(session.userId, session.membershipId);
  return ok({
    place: `${body.home.object.name} · ${body.home.unit.name}`,
    canCreate: membership?.role === "RESIDENT",
    ...residentAccess(body.home.unit.id, body.home.object.id),
  });
}

function requests(session: SessionRef | null): Reply {
  const view = home(session);
  const body = view.body as { home?: { unit: { id: string }; serviceCategories: string[] } };
  if (!body.home || !session) return view;
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const rows = readOps()
    .requests.filter((request) => request.unitId === body.home?.unit.id)
    .filter((request) => membership?.role !== "FAMILY_MEMBER" || request.authorUserId === session.userId)
    .map((request) => ({ id: request.id, category: request.category, text: request.text, status: request.status }));
  return ok({ categories: body.home.serviceCategories, requests: rows });
}

function tree(session: SessionRef | null, input: unknown): Reply {
  const actor = actorFromSession(session);
  if (!actor.ok) return fail(actor.status, actor.message);
  const objectId = (input as { objectId?: unknown } | null)?.objectId;
  if (typeof objectId !== "string") return fail(400, "Объект не найден");
  const value = treeFor(actor.value, objectId);
  if (!value) return fail(404, "Объект не найден");
  return ok(value);
}

function residents(session: SessionRef | null): Reply {
  const actor = actorFromSession(session);
  if (!actor.ok) return fail(actor.status, actor.message);
  return ok(residentBoard(actor.value));
}

function settings(session: SessionRef | null): Reply {
  const actor = actorFromSession(session);
  if (!actor.ok) return fail(actor.status, actor.message);
  return ok(settingsFor(actor.value));
}

async function addRequest(session: SessionRef | null, input: unknown): Promise<Reply> {
  const body = input as { category?: unknown; text?: unknown; fileName?: unknown; fileBase64?: unknown } | null;
  let fileName: string | undefined;
  if (typeof body?.fileName === "string" && body.fileName && typeof body.fileBase64 === "string" && body.fileBase64) {
    const membership = session?.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
    if (!membership) return fail(403, "Нет доступа");
    const bytes = Buffer.from(body.fileBase64, "base64");
    if (bytes.length > 1_000_000) return fail(400, "Файл слишком большой");
    const stored = await keepFile({ companyId: membership.companyId, name: body.fileName, bytes });
    fileName = stored ?? undefined;
  }
  const result = await addRequestFor(session, body?.category, body?.text, fileName);
  if (!result.ok) return fail(result.status, result.message);
  return ok({ id: result.value.id, status: result.value.status });
}

function mutate(session: SessionRef | null, input: unknown, kind: string): Reply {
  const actor = actorFromSession(session);
  if (!actor.ok) return fail(actor.status, actor.message);
  const body = (input ?? {}) as {
    objectId?: string;
    buildingId?: string;
    unitId?: string;
    name?: unknown;
    type?: unknown;
    address?: unknown;
  };
  if (kind === "createObject") return asReply(createObject(actor.value, { name: body.name, type: body.type, address: body.address }), 201);
  if (kind === "updateObject") return asReply(updateObject(actor.value, body.objectId ?? "", { name: body.name, address: body.address }));
  if (kind === "removeObject") return asReply(removeObject(actor.value, body.objectId ?? ""));
  if (kind === "createBuilding") return asReply(createBuilding(actor.value, body.objectId ?? "", body.name), 201);
  if (kind === "removeBuilding") return asReply(removeBuilding(actor.value, body.buildingId ?? ""));
  if (kind === "createUnit") return asReply(createUnit(actor.value, body.objectId ?? "", { name: body.name, buildingId: body.buildingId }), 201);
  return asReply(removeUnit(actor.value, body.unitId ?? ""));
}

function person(session: SessionRef | null, input: unknown, kind: "add" | "remove"): Reply {
  const actor = actorFromSession(session);
  if (!actor.ok) return fail(actor.status, actor.message);
  if (kind === "remove") {
    const id = (input as { membershipId?: string } | null)?.membershipId ?? "";
    return asReply(removeResident(actor.value, id));
  }
  return asReply(addResident({ ...actor.value }, input as never), 201);
}

async function subscribe(session: SessionRef | null, input: unknown): Promise<Reply> {
  if (!session) return fail(401, "Нужно войти");
  const body = input as { endpoint?: unknown; p256dh?: unknown; auth?: unknown } | null;
  if (typeof body?.endpoint !== "string" || typeof body.p256dh !== "string" || typeof body.auth !== "string") {
    return fail(400, "Не удалось сохранить уведомление");
  }
  await runtime.__starSavePush?.({ userId: session.userId, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth });
  return ok({ saved: true });
}

function liveToken(session: SessionRef | null): Reply {
  if (!session) return fail(401, "Нужно войти");
  const membership = session.membershipId ? findMembership(session.userId, session.membershipId) : undefined;
  const objectId = membership?.objectId ?? "";
  if (!objectId) return fail(403, "Нет доступа");
  const exp = Date.now() + 60_000;
  const body = Buffer.from(JSON.stringify({ userId: session.userId, objectId, exp })).toString("base64url");
  const secret = process.env.STAR_HOME_INTERNAL_SECRET ?? "star-home-dev-internal";
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return ok({ token: `${body}.${signature}`, objectId });
}
