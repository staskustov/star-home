import mqtt from "mqtt";
import { assertLocalMqttUrl } from "./broker-url";

export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

export type MqttClientLike = {
  connected: boolean;
  reconnecting?: boolean;
  on(event: string, handler: (...args: unknown[]) => void): void;
  subscribe(topics: string[], opts: { qos: number }, cb?: (error?: Error | null) => void): void;
  publish(topic: string, payload: string, opts: object, cb?: (error?: Error | null) => void): void;
  end(force: boolean, opts: object, cb?: () => void): void;
};

export type MqttSession = {
  connected: () => boolean;
  reconnecting: () => boolean;
  lastError: () => string | null;
  publish: (topic: string, payload: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

const controlTopics = ["/devices/+/controls/+", "/devices/+/meta/+"];

export function connectLocalMqtt(opts: {
  url?: string;
  username?: string;
  password?: string;
  clientId?: string;
  onMessage: MqttMessageHandler;
  connect?: (url: string, options: Record<string, unknown>) => MqttClientLike;
}): MqttSession {
  const check = assertLocalMqttUrl(opts.url);
  let lastError: string | null = check.ok ? "mqtt-connecting" : check.error;
  if (!check.ok) {
    return {
      connected: () => false,
      reconnecting: () => false,
      lastError: () => lastError,
      publish: async () => false,
      disconnect: async () => undefined,
    };
  }

  const connect = opts.connect ?? ((url: string, options: Record<string, unknown>) => mqtt.connect(url, options) as unknown as MqttClientLike);
  const client = connect(check.url, {
    clientId: opts.clientId ?? `star-home-gw-${process.pid}`,
    username: opts.username,
    password: opts.password,
    reconnectPeriod: 5_000,
    connectTimeout: 8_000,
    protocolVersion: 4,
    resubscribe: true,
  });

  function subscribe() {
    client.subscribe(controlTopics, { qos: 1 }, (error) => {
      if (error) lastError = error.message.slice(0, 200);
    });
  }

  client.on("connect", () => {
    lastError = null;
    subscribe();
  });
  client.on("reconnect", () => {
    lastError = lastError ?? "mqtt-reconnect";
  });
  client.on("offline", () => {
    lastError = "mqtt-offline";
  });
  client.on("error", (...args: unknown[]) => {
    const error = args[0];
    lastError = (error instanceof Error ? error.message : "mqtt-error").slice(0, 200);
  });
  client.on("message", (...args: unknown[]) => {
    const topic = args[0];
    const payload = args[1];
    if (typeof topic === "string" && Buffer.isBuffer(payload)) opts.onMessage(topic, payload);
  });

  return {
    connected: () => client.connected,
    reconnecting: () => Boolean(client.reconnecting),
    lastError: () => lastError,
    async publish(topic, payload) {
      if (!client.connected) return false;
      try {
        await new Promise<void>((resolve, reject) => {
          client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        return true;
      } catch {
        lastError = "mqtt-publish-failed";
        return false;
      }
    },
    async disconnect() {
      await new Promise<void>((resolve) => {
        client.end(false, {}, () => resolve());
      });
    },
  };
}

export function parseMqttPayload(payload: Buffer): unknown {
  const text = payload.toString("utf8").trim();
  if (!text) return null;
  if (text === "true" || text === "false") return text === "true";
  if (Number.isFinite(Number(text))) return Number(text);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
