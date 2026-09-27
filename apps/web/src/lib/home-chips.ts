export const homeChipIcons = [
  "house",
  "work",
  "travel",
  "night",
  "gate",
  "guests",
  "security",
  "devices",
  "rooms",
  "climate",
  "camera",
  "lock",
  "settings",
  "home",
  "payments",
] as const;

export const homeChipActions = ["open-gate", "open-point", "guests", "security", "pay", "lights-off", "curtains-close", "night"] as const;

export type HomeChipIcon = (typeof homeChipIcons)[number];
export type HomeChipAction = (typeof homeChipActions)[number];
