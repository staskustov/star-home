export type StoreBinder = {
  load: (name: string) => unknown;
  save: (name: string, value: unknown) => void | Promise<void>;
};

export type LiveEvent = {
  objectId: string;
  kind: string;
  title: string;
  seq?: number;
  at?: string;
  deviceId?: string;
  gatewayId?: string;
};

const runtime = globalThis as typeof globalThis & {
  __starBind?: StoreBinder;
  __starPublish?: (event: LiveEvent) => void;
  __starPush?: (userId: string, body: string, title?: string) => Promise<void> | void;
  __starFiles?: (input: { companyId: string; name: string; bytes: Buffer }) => Promise<string> | string;
  __starFlush?: Promise<void>;
};

export function bindStore(binder: StoreBinder): void {
  runtime.__starBind = binder;
  runtime.__starFlush = Promise.resolve();
}

const storeCaches: Record<string, string> = {
  ops: "__starHomeOps",
  people: "__starHomePeople",
  audit: "__starHomeAudit",
  catalog: "__starHomeCatalog",
  life: "__starHomeLife",
};

export const storeNames = Object.keys(storeCaches);

export function forgetStores(names: string[]): void {
  const caches = globalThis as unknown as Record<string, unknown>;
  for (const name of names) {
    const key = storeCaches[name];
    if (key) delete caches[key];
  }
}

export function boundValue(name: string): unknown {
  return runtime.__starBind?.load(name);
}

export function remember(name: string, value: unknown): boolean {
  const binder = runtime.__starBind;
  if (!binder) return false;
  const result = binder.save(name, value);
  if (result && typeof (result as Promise<void>).then === "function") {
    runtime.__starFlush = (runtime.__starFlush ?? Promise.resolve()).then(() => result as Promise<void>);
  }
  return true;
}

export function storesFlushed(): Promise<void> {
  return runtime.__starFlush ?? Promise.resolve();
}

export function publishLive(event: LiveEvent): void {
  runtime.__starPublish?.(event);
}

export function bindLive(publish: (event: LiveEvent) => void): void {
  runtime.__starPublish = publish;
}

export function pushNotice(userId: string, body: string, title = "STAR HOME"): void {
  void runtime.__starPush?.(userId, body, title);
}

export function bindPush(push: (userId: string, body: string, title?: string) => Promise<void> | void): void {
  runtime.__starPush = push;
}

export async function keepFile(input: { companyId: string; name: string; bytes: Buffer }): Promise<string | null> {
  const stored = await runtime.__starFiles?.(input);
  return stored ?? null;
}

export function bindFiles(save: (input: { companyId: string; name: string; bytes: Buffer }) => Promise<string> | string): void {
  runtime.__starFiles = save;
}
