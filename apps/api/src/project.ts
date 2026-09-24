import type { PrismaClient } from "@prisma/client";

const roles = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "OBJECT_ADMIN",
  "MANAGER",
  "SECURITY",
  "SERVICE_OPERATOR",
  "ACCOUNTANT",
  "RESIDENT",
  "FAMILY_MEMBER",
  "GUEST",
];

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function projectSnapshot(prisma: PrismaClient, name: string, value: unknown): Promise<void> {
  if (!value || typeof value !== "object") return;
  const body = value as Record<string, unknown>;
  if (name === "catalog") await projectCatalog(prisma, body);
  if (name === "people") await projectPeople(prisma, body);
  if (name === "life") await projectLife(prisma, body);
  if (name === "ops") await projectOps(prisma, body);
}

async function projectCatalog(prisma: PrismaClient, body: Record<string, unknown>): Promise<void> {
  for (const company of list<{ id: string; name: string }>(body.companies)) {
    await prisma.company.upsert({ where: { id: company.id }, create: { id: company.id, name: company.name }, update: { name: company.name } });
  }
  for (const object of list<{ id: string; companyId: string; name: string; type: string; address: string }>(body.objects)) {
    const row = { companyId: object.companyId, name: object.name, type: object.type, address: object.address };
    await prisma.residentialObject.upsert({ where: { id: object.id }, create: { id: object.id, ...row }, update: row });
  }
  for (const building of list<{ id: string; objectId: string; name: string; number: string }>(body.buildings)) {
    const row = { objectId: building.objectId, name: building.name, number: building.number };
    await prisma.building.upsert({ where: { id: building.id }, create: { id: building.id, ...row }, update: row });
  }
  for (const unit of list<{ id: string; objectId: string; buildingId: string | null; name: string; number: string; type: string }>(body.units)) {
    const row = { objectId: unit.objectId, buildingId: unit.buildingId, name: unit.name, number: unit.number, type: unit.type };
    await prisma.unit.upsert({ where: { id: unit.id }, create: { id: unit.id, ...row }, update: row });
  }
}

async function projectPeople(prisma: PrismaClient, body: Record<string, unknown>): Promise<void> {
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }
  const users = list<{
    id: string;
    login: string;
    name: string;
    passwordHash: string;
    email?: string;
    phone?: string;
    status?: string;
    lastLoginAt?: string | null;
  }>(body.users);
  for (const user of users) {
    const row = {
      login: user.login,
      name: user.name,
      passwordHash: user.passwordHash,
      email: user.email ?? "",
      phone: user.phone ?? "",
      status: user.status ?? "ACTIVE",
      lastLoginAt: user.lastLoginAt ?? null,
    };
    await prisma.user.upsert({ where: { id: user.id }, create: { id: user.id, ...row }, update: row });
  }
  for (const membership of list<{
    id: string;
    userId: string;
    companyId: string;
    role: string;
    objectId: string | null;
    buildingId?: string | null;
    unitId: string | null;
    expiresAt?: string | null;
    passId?: string | null;
    status?: string;
    createdAt?: string | null;
    createdBy?: string | null;
  }>(body.memberships)) {
    const row = {
      userId: membership.userId,
      companyId: membership.companyId,
      role: membership.role,
      objectId: membership.objectId,
      buildingId: membership.buildingId ?? null,
      unitId: membership.unitId,
      expiresAt: membership.expiresAt ?? null,
      passId: membership.passId ?? null,
      status: membership.status ?? "ACTIVE",
      createdAt: membership.createdAt ?? null,
      createdBy: membership.createdBy ?? null,
    };
    await prisma.membership.upsert({ where: { id: membership.id }, create: { id: membership.id, ...row }, update: row });
    const person = users.find((item) => item.id === membership.userId);
    if (!person || !membership.objectId || !membership.unitId) continue;
    const home = { userId: membership.userId, companyId: membership.companyId, objectId: membership.objectId, unitId: membership.unitId, name: person.name };
    if (membership.role === "RESIDENT") {
      await prisma.resident.upsert({ where: { id: membership.id }, create: { id: membership.id, ...home }, update: home });
    }
    if (membership.role === "FAMILY_MEMBER") {
      await prisma.familyMember.upsert({ where: { id: membership.id }, create: { id: membership.id, ...home }, update: home });
    }
  }
}

async function projectLife(prisma: PrismaClient, body: Record<string, unknown>): Promise<void> {
  for (const mode of list<{ objectId: string; mode: string; label: string; summary: string; climate: string; lighting: string; security: string }>(body.modes)) {
    const id = `${mode.objectId}_${mode.mode}`;
    await prisma.lifeModeSetting.upsert({
      where: { id },
      create: { id, objectId: mode.objectId, mode: mode.mode, label: mode.label, summary: mode.summary },
      update: { label: mode.label, summary: mode.summary },
    });
    await prisma.automation.upsert({
      where: { id },
      create: { id, objectId: mode.objectId, mode: mode.mode, climate: mode.climate, lighting: mode.lighting, security: mode.security },
      update: { climate: mode.climate, lighting: mode.lighting, security: mode.security },
    });
  }
  for (const active of list<{ unitId: string; mode: string }>(body.active)) {
    await prisma.lifeModeActive.upsert({
      where: { unitId: active.unitId },
      create: active,
      update: { mode: active.mode },
    });
  }
}

async function projectOps(prisma: PrismaClient, body: Record<string, unknown>): Promise<void> {
  for (const pass of list<{ id: string; companyId: string; objectId: string; unitId: string; guestName: string; detail: string; vehicle?: string; code?: string }>(body.passes)) {
    const row = {
      companyId: pass.companyId,
      objectId: pass.objectId,
      unitId: pass.unitId,
      guestName: pass.guestName,
      detail: pass.detail,
      vehicle: pass.vehicle ?? "",
      code: pass.code ?? "",
    };
    await prisma.visitorPass.upsert({ where: { id: pass.id }, create: { id: pass.id, ...row }, update: row });
    await prisma.visitor.upsert({
      where: { id: pass.id },
      create: { id: pass.id, name: pass.guestName, passId: pass.id },
      update: { name: pass.guestName, passId: pass.id },
    });
    if (pass.vehicle) {
      await prisma.vehicle.upsert({
        where: { id: pass.id },
        create: { id: pass.id, passId: pass.id, plate: pass.vehicle },
        update: { plate: pass.vehicle, passId: pass.id },
      });
    }
  }
  for (const event of list<{ id: string; companyId: string; objectId: string; unitId: string | null; time: string; title: string; result: string }>(body.events)) {
    const row = { companyId: event.companyId, objectId: event.objectId, unitId: event.unitId, time: event.time, title: event.title, result: event.result };
    await prisma.accessEvent.upsert({ where: { id: event.id }, create: { id: event.id, ...row }, update: row });
  }
  for (const request of list<{ id: string; companyId: string; objectId: string; unitId: string; authorUserId: string; category: string; text: string; status: string }>(body.requests)) {
    const row = {
      companyId: request.companyId,
      objectId: request.objectId,
      unitId: request.unitId,
      authorUserId: request.authorUserId,
      category: request.category,
      text: request.text,
      status: request.status,
    };
    await prisma.serviceRequest.upsert({ where: { id: request.id }, create: { id: request.id, ...row }, update: row });
  }
  for (const invoice of list<{ id: string; companyId: string; objectId: string; unitId: string; title: string; amount: number; currency: string; status: string }>(body.invoices)) {
    await prisma.invoice.upsert({
      where: { id: invoice.id },
      create: invoice,
      update: { status: invoice.status, amount: invoice.amount, title: invoice.title },
    });
    if (invoice.status === "PAID") {
      await prisma.payment.upsert({
        where: { invoiceId: invoice.id },
        create: { id: `pay_${invoice.id}`, invoiceId: invoice.id, amount: invoice.amount, currency: invoice.currency, status: "PAID" },
        update: { amount: invoice.amount, status: "PAID" },
      });
    }
  }
  for (const meter of list<{ id: string; companyId: string; objectId: string; unitId: string; name: string; unit: string }>(body.meters)) {
    await prisma.meter.upsert({
      where: { id: meter.id },
      create: meter,
      update: { name: meter.name, unit: meter.unit, unitId: meter.unitId, objectId: meter.objectId, companyId: meter.companyId },
    });
  }
  for (const reading of list<{ id: string; meterId: string; value: number; at: string }>(body.meterReadings)) {
    await prisma.meterReading.upsert({ where: { id: reading.id }, create: reading, update: { value: reading.value, at: reading.at, meterId: reading.meterId } });
  }
  const readings = list<{ deviceId: string; temperatureC: number; humidityPercent: number }>(body.readings);
  for (const device of list<{ id: string; companyId: string; objectId: string; unitId: string | null; kind: string; name: string; adapter: string }>(body.devices)) {
    const row = { companyId: device.companyId, objectId: device.objectId, unitId: device.unitId, kind: device.kind, name: device.name, adapter: device.adapter };
    await prisma.device.upsert({ where: { id: device.id }, create: { id: device.id, ...row }, update: row });
    const reading = readings.find((item) => item.deviceId === device.id);
    await prisma.deviceState.upsert({
      where: { deviceId: device.id },
      create: { deviceId: device.id, state: reading ? "Показание" : "На связи", temperatureC: reading?.temperatureC ?? null, humidityPercent: reading?.humidityPercent ?? null },
      update: { state: reading ? "Показание" : "На связи", temperatureC: reading?.temperatureC ?? null, humidityPercent: reading?.humidityPercent ?? null },
    });
  }
  for (const alarm of list<{ id: string; companyId: string; objectId: string; unitId: string; title: string; status: string; at: string }>(body.alarms)) {
    await prisma.securityEvent.upsert({ where: { id: alarm.id }, create: alarm, update: { status: alarm.status, title: alarm.title, at: alarm.at } });
  }
  for (const notice of list<{ id: string; companyId: string; userId: string; title: string; body: string; at: string }>(body.notices)) {
    await prisma.notification.upsert({ where: { id: notice.id }, create: notice, update: { title: notice.title, body: notice.body, at: notice.at } });
  }
  for (const turn of list<{ id: string; companyId: string; userId: string; unitId: string; prompt: string; reply: string }>(body.turns)) {
    const row = { companyId: turn.companyId, userId: turn.userId, unitId: turn.unitId, prompt: turn.prompt, reply: turn.reply };
    await prisma.aiMessage.upsert({ where: { id: turn.id }, create: { id: turn.id, ...row }, update: row });
  }
  for (const entry of list<{ id: string; actorUserId: string; companyId: string; objectId: string; action: string; target: string; result: string; error: string; at: string }>(body.audit)) {
    await prisma.auditLog.upsert({
      where: { id: entry.id },
      create: entry,
      update: { result: entry.result, error: entry.error, at: entry.at, action: entry.action, target: entry.target },
    });
  }
}
