import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { boundValue, remember } from "@/server/store-bind";
import { residentHome } from "@/mocks/resident-home";
import { lifeModeChecks, lifeModes, type LifeMode, type LifeModeCheck, type LifeModeSetting } from "@/types/domain";

type LifeFile = {
  modes: (LifeModeSetting & { objectId: string })[];
  active: { unitId: string; mode: LifeMode }[];
};

const filePath = path.join(process.cwd(), "data", "life-modes.json");
const globalStore = globalThis as typeof globalThis & { __starHomeLife?: LifeFile };
const checkIds = new Set<string>(lifeModeChecks.map((check) => check.id));

function load(): LifeFile {
  if (globalStore.__starHomeLife) return globalStore.__starHomeLife;
  const bound = boundValue("life");
  if (bound) {
    globalStore.__starHomeLife = bound as LifeFile;
    return globalStore.__starHomeLife;
  }
  if (existsSync(filePath)) {
    globalStore.__starHomeLife = JSON.parse(readFileSync(filePath, "utf8")) as LifeFile;
    return globalStore.__starHomeLife;
  }
  const file: LifeFile = { modes: [], active: [] };
  persist(file);
  return file;
}

function persist(file: LifeFile): void {
  globalStore.__starHomeLife = file;
  if (remember("life", file)) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(file));
}

function defaults(): LifeModeSetting[] {
  return residentHome.lifeModes.map((mode) => ({ ...mode, checks: [...mode.checks] }));
}

export function isLifeMode(value: unknown): value is LifeMode {
  return typeof value === "string" && lifeModes.includes(value as LifeMode);
}

export function modesForObject(objectId: string): LifeModeSetting[] {
  const file = load();
  const stored = file.modes.filter((mode) => mode.objectId === objectId);
  if (stored.length === lifeModes.length) {
    return lifeModes.map((mode) => stored.find((item) => item.mode === mode)!);
  }
  const seeded = defaults().map((mode) => ({ ...mode, objectId }));
  file.modes = [...file.modes.filter((mode) => mode.objectId !== objectId), ...seeded];
  persist(file);
  return seeded;
}

export function modeForUnit(unitId: string): LifeMode {
  return load().active.find((item) => item.unitId === unitId)?.mode ?? "HOME";
}

export function setUnitMode(unitId: string, mode: LifeMode): void {
  const file = load();
  const current = file.active.find((item) => item.unitId === unitId);
  if (current) current.mode = mode;
  else file.active.push({ unitId, mode });
  persist(file);
}

export function updateModeSetting(objectId: string, setting: LifeModeSetting): void {
  const file = load();
  modesForObject(objectId);
  const index = file.modes.findIndex((mode) => mode.objectId === objectId && mode.mode === setting.mode);
  const next = { ...setting, checks: setting.checks.filter((check) => checkIds.has(check)), objectId };
  if (index >= 0) file.modes[index] = next;
  else file.modes.push(next);
  persist(file);
}

export function knownChecks(values: unknown): LifeModeCheck[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is LifeModeCheck => typeof value === "string" && checkIds.has(value));
}
