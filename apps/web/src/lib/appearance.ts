export const paletteIds = ["bronze", "green", "blue", "red", "yellow", "ink"] as const;

export type PaletteId = (typeof paletteIds)[number];
export type ThemeMode = "light" | "dark";

export const appearanceKey = "star-home-appearance";

export type ThemeChoice = {
  id: PaletteId;
  mode: ThemeMode;
  label: string;
  tone: string;
  bg: string;
  surface: string;
  accent: string;
};

export const themeChoices: ThemeChoice[] = [
  { id: "bronze", mode: "dark", label: "Бронза", tone: "Тёмная", bg: "#1b1713", surface: "#3e352c", accent: "#eadfce" },
  { id: "bronze", mode: "light", label: "Бронза", tone: "Светлая", bg: "#ece5da", surface: "#fbf8f3", accent: "#3e3226" },
  { id: "green", mode: "light", label: "Зелёная", tone: "Светлая", bg: "#f6f4f0", surface: "#ffffff", accent: "#1f3a34" },
  { id: "blue", mode: "light", label: "Синяя", tone: "Светлая", bg: "#f3f6f8", surface: "#ffffff", accent: "#1d445c" },
  { id: "red", mode: "light", label: "Красная", tone: "Светлая", bg: "#f7f3f1", surface: "#ffffff", accent: "#6d3834" },
  { id: "yellow", mode: "light", label: "Жёлтая", tone: "Светлая", bg: "#f7f4ec", surface: "#fffdf8", accent: "#6a5424" },
  { id: "ink", mode: "light", label: "Чёрная", tone: "Светлая", bg: "#f4f3f1", surface: "#ffffff", accent: "#2c2c2a" },
  { id: "green", mode: "dark", label: "Зелёная", tone: "Тёмная", bg: "#161513", surface: "#221f1c", accent: "#8eaea3" },
  { id: "blue", mode: "dark", label: "Синяя", tone: "Тёмная", bg: "#12181d", surface: "#1b242c", accent: "#9eb8c8" },
  { id: "red", mode: "dark", label: "Красная", tone: "Тёмная", bg: "#181312", surface: "#261e1c", accent: "#d4a39a" },
  { id: "yellow", mode: "dark", label: "Жёлтая", tone: "Тёмная", bg: "#16140f", surface: "#242016", accent: "#d4c08a" },
  { id: "ink", mode: "dark", label: "Чёрная", tone: "Тёмная", bg: "#101010", surface: "#1a1a1a", accent: "#c8c4bc" },
];

function isPalette(value: string): value is PaletteId {
  return paletteIds.some((id) => id === value);
}

export function currentAppearance(): { mode: ThemeMode; palette: PaletteId } {
  const root = document.documentElement;
  const palette = root.dataset.palette ?? "green";
  return {
    mode: root.dataset.theme === "dark" ? "dark" : "light",
    palette: isPalette(palette) ? palette : "green",
  };
}

export function applyAppearance(mode: ThemeMode, palette: PaletteId) {
  const root = document.documentElement;
  if (mode === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  if (palette === "green") delete root.dataset.palette;
  else root.dataset.palette = palette;
  localStorage.setItem(appearanceKey, `${mode}:${palette}`);
}
