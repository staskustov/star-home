import { clock, newId, readOps, recentNotice, trimNotices, writeOps } from "@/server/ops-store";
import { listMemberships } from "@/server/people-store";
import { pushNotice } from "@/server/store-bind";

export function notifyHousehold(input: {
  companyId: string;
  objectId: string;
  unitId: string | null;
  title: string;
  body: string;
  severity?: "INFO" | "WARNING" | "ALERT";
}): void {
  const file = readOps();
  const stamp = new Date().toISOString();
  const people = listMemberships().filter(
    (membership) =>
      membership.companyId === input.companyId &&
      membership.objectId === input.objectId &&
      (!input.unitId || membership.unitId === input.unitId) &&
      (membership.role === "RESIDENT" || membership.role === "FAMILY_MEMBER") &&
      membership.status !== "REVOKED",
  );
  const targets: string[] = [];
  for (const membership of people) {
    if (recentNotice(file.notices, membership.userId, input.title, input.body)) continue;
    file.notices.unshift({
      id: newId("note"),
      companyId: input.companyId,
      userId: membership.userId,
      title: input.title,
      body: input.body,
      at: clock(),
      atIso: stamp,
      severity: input.severity ?? "INFO",
    });
    targets.push(membership.userId);
  }
  file.notices = trimNotices(file.notices);
  writeOps(file);
  for (const userId of targets) pushNotice(userId, input.body, input.title);
}

const alarmKinds = new Set(["LEAK", "SMOKE", "FIRE"]);

export function notifyIfAlert(input: {
  companyId: string;
  objectId: string;
  unitId: string | null;
  name: string;
  kind?: string;
  before?: { work?: string; detected?: boolean; availability?: string };
  after: { work?: string; detected?: boolean; availability?: string };
}): void {
  const fault = input.after.work === "FAULT" && input.before?.work !== "FAULT";
  const offline = input.after.availability === "OFFLINE" && input.before?.availability !== "OFFLINE";
  const alarming = !input.kind || alarmKinds.has(input.kind);
  const raised = alarming && afterDetected(input.after) && !afterDetected(input.before);
  if (!fault && !offline && !raised) return;
  notifyHousehold({
    companyId: input.companyId,
    objectId: input.objectId,
    unitId: input.unitId,
    title: "Устройство",
    body: fault
      ? `${input.name}: неисправно.`
      : offline
        ? `${input.name}: нет связи.`
        : input.kind === "LEAK"
          ? `${input.name}: протечка.`
          : input.kind === "SMOKE" || input.kind === "FIRE"
            ? `${input.name}: дым.`
            : `${input.name}: есть сигнал.`,
    severity: "ALERT",
  });
}

function afterDetected(state?: { detected?: boolean }): boolean {
  return state?.detected === true;
}
