import names from "@/lib/material-symbols.json";

export const materialSymbolNames = names as string[];
const known = new Set(materialSymbolNames);

export const defaultDeviceIcons: Record<string, string> = {
  GATE: "garage",
  WICKET: "door_front",
  BARRIER: "fence",
  LOCK: "lock",
  CLIMATE: "thermostat",
  HEATING: "mode_heat",
  LIGHTING: "lightbulb",
  CAMERA: "videocam",
  MOTION: "sensors",
  LEAK: "water_damage",
  SMOKE: "detector_smoke",
  FIRE: "local_fire_department",
  POWER: "electrical_services",
  WATER: "water_drop",
  IRRIGATION: "sprinkler",
  CURTAIN: "blinds",
  WEATHER: "partly_cloudy_day",
};

const kindSuggestions: Record<string, string[]> = {
  GATE: ["garage", "garage_home", "sensor_door", "gate"],
  WICKET: ["door_front", "door_sliding", "sensor_door", "login"],
  BARRIER: ["fence", "block", "traffic"],
  LOCK: ["lock", "lock_open", "key", "pin"],
  CLIMATE: ["thermostat", "device_thermostat", "dew_point", "humidity_percentage", "co2", "air", "thermostat_auto"],
  HEATING: ["mode_heat", "heat_pump", "local_fire_department", "thermostat"],
  LIGHTING: ["lightbulb", "light", "wb_incandescent", "floor_lamp", "table_lamp", "wall_lamp", "highlight", "flare"],
  CAMERA: ["videocam", "photo_camera", "camera_outdoor", "nest_cam_wired_stand"],
  MOTION: ["sensors", "directions_walk", "visibility", "radar"],
  LEAK: ["water_damage", "water_drop", "humidity_high", "warning"],
  SMOKE: ["detector_smoke", "air", "warning"],
  FIRE: ["local_fire_department", "mode_heat", "emergency"],
  POWER: ["electrical_services", "bolt", "power", "outlet"],
  WATER: ["water_drop", "shower", "valve", "water"],
  IRRIGATION: ["sprinkler", "yard", "water_drop", "grass"],
  CURTAIN: ["blinds", "curtains", "window", "roller_shades"],
  WEATHER: ["partly_cloudy_day", "sunny", "cloud", "air"],
};

const ruHints: [string, string[]][] = [
  ["свет", ["lightbulb", "light", "wb_incandescent"]],
  ["ламп", ["lightbulb", "floor_lamp", "table_lamp"]],
  ["климат", ["thermostat", "device_thermostat"]],
  ["температур", ["thermostat", "device_thermostat"]],
  ["влажн", ["humidity_percentage", "dew_point"]],
  ["камер", ["videocam", "photo_camera"]],
  ["замок", ["lock", "lock_open"]],
  ["ворот", ["garage", "sensor_door"]],
  ["калитк", ["door_front"]],
  ["протеч", ["water_damage", "water_drop"]],
  ["дымо", ["detector_smoke"]],
  ["пожар", ["local_fire_department"]],
  ["штор", ["blinds", "curtains"]],
  ["погод", ["partly_cloudy_day", "sunny", "cloud"]],
  ["отопл", ["mode_heat", "heat_pump"]],
  ["полив", ["sprinkler", "grass"]],
  ["розет", ["outlet", "electrical_services"]],
];

export function isMaterialSymbol(value: unknown): value is string {
  return typeof value === "string" && known.has(value);
}

export function cleanDeviceIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return known.has(name) ? name : null;
}

export function deviceIconOf(icon: string | null | undefined, kind?: string): string {
  if (icon && known.has(icon)) return icon;
  if (kind && defaultDeviceIcons[kind]) return defaultDeviceIcons[kind];
  return "memory";
}

export const deviceIconSwatches = [
  { hex: "#c4a574", label: "Бронза" },
  { hex: "#e0a04a", label: "Янтарь" },
  { hex: "#d97757", label: "Терракота" },
  { hex: "#c45c4a", label: "Красный" },
  { hex: "#b86b8a", label: "Розовый" },
  { hex: "#7d6bb0", label: "Фиолетовый" },
  { hex: "#5b8ab5", label: "Синий" },
  { hex: "#4a9b8e", label: "Бирюза" },
  { hex: "#5a9a6a", label: "Зелёный" },
  { hex: "#6e675e", label: "Графит" },
] as const;

const allowedColors = new Set<string>(deviceIconSwatches.map((swatch) => swatch.hex));

export function cleanDeviceIconColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  return allowedColors.has(hex) ? hex : null;
}

export function deviceIconColorOf(value: string | null | undefined): string | null {
  return cleanDeviceIconColor(value);
}

export function deviceIconColorLabel(value: string | null | undefined): string {
  const hex = deviceIconColorOf(value);
  if (!hex) return "Цвет темы";
  return deviceIconSwatches.find((swatch) => swatch.hex === hex)?.label ?? hex;
}

export function suggestedIconsForKind(kind: string): string[] {
  const extra = (kindSuggestions[kind] ?? []).filter((name) => known.has(name));
  const fallback = defaultDeviceIcons[kind];
  return [...new Set([fallback, ...extra].filter((name): name is string => Boolean(name && known.has(name))))];
}

export function searchMaterialSymbols(query: string, kind?: string, limit = 160): string[] {
  const raw = query.trim().toLowerCase();
  const suggested = kind ? suggestedIconsForKind(kind) : [];
  if (!raw) {
    const rest = materialSymbolNames.filter((name) => !suggested.includes(name));
    return [...suggested, ...rest].slice(0, limit);
  }
  const needle = raw.replace(/\s+/g, "_");
  const compact = needle.replace(/_/g, "");
  const boosted = new Set<string>(suggested);
  for (const [hint, icons] of ruHints) {
    if (raw.includes(hint)) icons.forEach((icon) => boosted.add(icon));
  }
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of materialSymbolNames) {
    if (boosted.has(name)) continue;
    const plain = name.replace(/_/g, "");
    if (name.startsWith(needle) || plain.startsWith(compact)) starts.push(name);
    else if (name.includes(needle) || plain.includes(compact)) contains.push(name);
  }
  return [...[...boosted].filter((name) => name.includes(needle) || name.replace(/_/g, "").includes(compact) || suggested.includes(name) || ruHints.some(([hint, icons]) => raw.includes(hint) && icons.includes(name))), ...starts, ...contains].slice(0, limit);
}
