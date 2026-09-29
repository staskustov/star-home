export const dataSources = ["REAL", "DEMO", "MOCK", "UNKNOWN"] as const;
export type DataSource = (typeof dataSources)[number];

export const commandLifecycles = [
  "ACCEPTED",
  "DELIVERED",
  "EXECUTING",
  "EXECUTED",
  "CONFIRMED",
  "FAILED",
  "TIMEOUT",
] as const;
export type CommandLifecycle = (typeof commandLifecycles)[number];

export function productionRuntime(): boolean {
  return process.env.NODE_ENV === "production" && process.env.STAR_HOME_ALLOW_DEMO !== "1";
}

export function demoExecutionAllowed(): boolean {
  return !productionRuntime();
}

export function isDataSource(value: unknown): value is DataSource {
  return typeof value === "string" && (dataSources as readonly string[]).includes(value);
}

export function dataSourceOf(device: {
  adapter?: string | null;
  gatewayId?: string | null;
  metadata?: Record<string, unknown> | null;
}): DataSource {
  const marked = device.metadata?.source;
  if (isDataSource(marked)) return marked;
  if (device.adapter === "simulator" || device.metadata?.simulator === true) return "MOCK";
  if (device.metadata?.demo === true) return "DEMO";
  if (device.adapter === "local" && !device.gatewayId) return "DEMO";
  if (device.adapter === "local") return "DEMO";
  if (device.gatewayId && device.adapter && device.adapter !== "local") return "REAL";
  return "UNKNOWN";
}
