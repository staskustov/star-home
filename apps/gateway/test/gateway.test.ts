import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { applyQueuedCommand, payloadMatches, wirenboardReadTopic, wirenboardSetPayload, wirenboardSetTopic } from "../apply";
import { assertLocalMqttUrl } from "../broker-url";
import { createCommandOnce } from "../command-once";
import { connectLocalMqtt, type MqttClientLike } from "../mqtt-session";
import { createOutboundBuffer, shouldBufferStatus } from "../outbound-buffer";
import { createTopicCache } from "../topic-cache";

describe("gateway apply", () => {
  it("does not confirm a command it did not apply", async () => {
    const result = await applyQueuedCommand(
      { id: "gcmd_1", deviceId: "dev_1", command: "setPower", value: true, adapter: "wirenboard", externalId: "relay_1" },
      { discover: () => ({ confirmed: false, error: "no-discovery-source" }) },
    );
    assert.equal(result.confirmed, false);
    assert.equal(result.error, "mqtt-offline");
  });

  it("confirms echo mode only when explicitly enabled", async () => {
    const result = await applyQueuedCommand(
      { id: "gcmd_echo", deviceId: "dev_1", command: "setPower", value: true, adapter: "local" },
      { echo: true, discover: () => ({ confirmed: false }) },
    );
    assert.equal(result.confirmed, true);
    assert.equal(result.sent, true);
    assert.equal(result.state?.on, true);
  });

  it("publishes to native Wiren Board topics and does not confirm", async () => {
    const published: { topic: string; payload: string }[] = [];
    const result = await applyQueuedCommand(
      { id: "gcmd_mqtt", deviceId: "dev_1", command: "setPower", value: true, adapter: "wirenboard", externalId: "wb-relay" },
      {
        discover: () => ({ confirmed: false }),
        publishMqtt: async (topic, payload) => {
          published.push({ topic, payload });
          return true;
        },
      },
    );
    assert.equal(result.confirmed, false);
    assert.equal(result.sent, true);
    assert.equal(published[0]?.topic, "/devices/wb-relay/controls/on/on");
    assert.equal(published[0]?.payload, "1");
  });

  it("maps set topics and payloads", () => {
    assert.equal(wirenboardSetTopic("wb-msw3", "setTemperature"), "/devices/wb-msw3/controls/target/on");
    assert.equal(wirenboardReadTopic("wb-msw3", "setTemperature"), "/devices/wb-msw3/controls/target");
    assert.equal(wirenboardReadTopic("wb-relay", "setPower"), "/devices/wb-relay/controls/on");
    assert.equal(wirenboardSetPayload("setPower", false), "0");
    assert.equal(wirenboardSetPayload("open", true), "1");
    assert.equal(payloadMatches("1", true), true);
    assert.equal(payloadMatches("1", "true"), true);
    assert.equal(payloadMatches("50", 50.0), true);
    assert.equal(payloadMatches("22.5", 22.51), true);
    assert.equal(payloadMatches("1", 0), false);
  });

  it("discovers from the live cache", async () => {
    const cache = createTopicCache();
    cache.ingest("/devices/wb-msw3/controls/Temperature", 22.4);
    cache.ingest("/devices/wb-msw3/controls/Humidity", 48);
    const result = await applyQueuedCommand(
      { id: "gcmd_d", deviceId: "gw", command: "discover" },
      { discover: () => ({ confirmed: true, devices: cache.devices() }) },
    );
    assert.equal(result.confirmed, true);
    const devices = result.devices as { externalId: string; channels: { capability: string | null; value: unknown }[] }[];
    assert.equal(devices[0]?.externalId, "wb-msw3");
    assert.equal(devices[0]?.channels.length, 2);
  });

  it("confirms HTTP only when the endpoint says confirmed", async () => {
    const ok = await applyQueuedCommand(
      { id: "gcmd_http", deviceId: "dev_1", command: "setPower", value: true, adapter: "http", endpoint: "http://127.0.0.1/dev" },
      {
        discover: () => ({ confirmed: false }),
        fetchHttp: async () => new Response(JSON.stringify({ confirmed: true, state: { on: true } }), { status: 200 }),
      },
    );
    assert.equal(ok.confirmed, true);
    const denied = await applyQueuedCommand(
      { id: "gcmd_http2", deviceId: "dev_1", command: "setPower", value: true, adapter: "http", endpoint: "http://127.0.0.1/dev" },
      {
        discover: () => ({ confirmed: false }),
        fetchHttp: async () => new Response(JSON.stringify({ confirmed: false }), { status: 200 }),
      },
    );
    assert.equal(denied.confirmed, false);
    assert.equal(denied.sent, true);
  });

  it("confirms MQTT after a matching control echo, including a duplicate retained value", async () => {
    const cache = createTopicCache();
    cache.ingest("/devices/wb-relay/controls/on", 1);
    const result = await applyQueuedCommand(
      { id: "gcmd_raw", deviceId: "dev_1", command: "setPower", value: true, adapter: "wirenboard", externalId: "wb-relay" },
      {
        discover: () => ({ confirmed: false }),
        readSeq: (topic) => cache.seq(topic),
        waitMqtt: (topic, match, timeoutMs, afterSeq, signal) => cache.waitFor(topic, match, timeoutMs, afterSeq, signal),
        commandTimeoutMs: 200,
        commandRetries: 0,
        publishMqtt: async (_topic, payload) => {
          cache.ingest("/devices/wb-relay/controls/on", payload === "1" ? 1 : 0);
          return true;
        },
      },
    );
    assert.equal(result.confirmed, true);
    assert.equal(result.sent, true);
    assert.equal(result.state?.on, true);
  });

  it("does not confirm from a stale cache value and returns mqtt-timeout", async () => {
    const cache = createTopicCache();
    cache.ingest("/devices/wb-relay/controls/on", 1);
    const result = await applyQueuedCommand(
      { id: "gcmd_timeout", deviceId: "dev_1", command: "setPower", value: true, adapter: "wirenboard", externalId: "wb-relay" },
      {
        discover: () => ({ confirmed: false }),
        readSeq: (topic) => cache.seq(topic),
        waitMqtt: (topic, match, timeoutMs, afterSeq, signal) => cache.waitFor(topic, match, timeoutMs, afterSeq, signal),
        commandTimeoutMs: 200,
        commandRetries: 0,
        publishMqtt: async () => true,
      },
    );
    assert.equal(result.confirmed, false);
    assert.equal(result.sent, true);
    assert.equal(result.error, "mqtt-timeout");
  });

  it("retries publish up to the cap until the control echo matches", async () => {
    const cache = createTopicCache();
    let publishes = 0;
    const result = await applyQueuedCommand(
      { id: "gcmd_retry", deviceId: "dev_1", command: "setPower", value: true, adapter: "wirenboard", externalId: "wb-relay" },
      {
        discover: () => ({ confirmed: false }),
        readSeq: (topic) => cache.seq(topic),
        waitMqtt: (topic, match, timeoutMs, afterSeq, signal) => cache.waitFor(topic, match, timeoutMs, afterSeq, signal),
        commandTimeoutMs: 200,
        commandRetries: 2,
        publishMqtt: async (_topic, payload) => {
          publishes += 1;
          if (publishes >= 3) cache.ingest("/devices/wb-relay/controls/on", payload === "1" ? 1 : 0);
          return true;
        },
      },
    );
    assert.equal(publishes, 3);
    assert.equal(result.confirmed, true);
    assert.equal(result.state?.on, true);
  });
});

describe("gateway mqtt cache", () => {
  it("dedups retained repeats and groups native topics", () => {
    const cache = createTopicCache();
    assert.equal(cache.ingest("/devices/wb-msw3/controls/Temperature", 22.4).duplicate, false);
    assert.equal(cache.ingest("/devices/wb-msw3/controls/Temperature", 22.4).duplicate, true);
    assert.equal(cache.ingest("/devices/wb-msw3/controls/Temperature", 23).duplicate, false);
    assert.equal(cache.devices()[0]?.channels.find((channel) => channel.capability === "temperature")?.value, 23);
  });

  it("waits for a message after seq, including a duplicate echo", async () => {
    const cache = createTopicCache();
    const topic = "/devices/wb-relay/controls/on";
    cache.ingest(topic, 1);
    const stale = cache.waitFor(topic, (value) => payloadMatches("1", value), 30, cache.seq(topic));
    assert.equal(await stale, undefined);
    const afterSeq = cache.seq(topic);
    const pending = cache.waitFor(topic, (value) => payloadMatches("1", value), 80, afterSeq);
    cache.ingest(topic, 1);
    assert.equal(await pending, 1);
    assert.equal(cache.seq(topic), afterSeq + 1);
  });
});

describe("gateway command once", () => {
  it("shares one in-flight apply for the same command id", async () => {
    const once = createCommandOnce<number>();
    let runs = 0;
    const task = async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 7;
    };
    const [first, second] = await Promise.all([once.run("gcmd_lock", task), once.run("gcmd_lock", task)]);
    assert.equal(first, 7);
    assert.equal(second, 7);
    assert.equal(runs, 1);
    assert.equal(await once.run("gcmd_lock", async () => 9), 7);
  });
});

describe("gateway mqtt reconnect", () => {
  it("resubscribes after offline and then publish works", async () => {
    const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    let subscribeCount = 0;
    const fake: MqttClientLike = {
      connected: false,
      reconnecting: false,
      on(event, handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      subscribe(_topics, _opts, cb) {
        subscribeCount += 1;
        cb?.(null);
      },
      publish(_topic, _payload, _opts, cb) {
        cb?.(null);
      },
      end(_force, _opts, cb) {
        cb?.();
      },
    };
    const emit = (event: string) => {
      for (const handler of handlers.get(event) ?? []) handler();
    };
    const session = connectLocalMqtt({
      url: "mqtt://127.0.0.1:1883",
      onMessage: () => undefined,
      connect: () => fake,
    });
    assert.equal(session.connected(), false);
    assert.equal(await session.publish("/devices/x/controls/on/on", "1"), false);
    fake.connected = true;
    emit("connect");
    assert.equal(session.connected(), true);
    assert.equal(session.lastError(), null);
    assert.equal(subscribeCount, 1);
    fake.connected = false;
    emit("offline");
    assert.equal(session.lastError(), "mqtt-offline");
    fake.reconnecting = true;
    emit("reconnect");
    assert.equal(session.reconnecting(), true);
    fake.connected = true;
    fake.reconnecting = false;
    emit("connect");
    assert.equal(subscribeCount, 2);
    assert.equal(session.lastError(), null);
    assert.equal(await session.publish("/devices/x/controls/on/on", "1"), true);
  });
});

describe("gateway broker url", () => {
  it("allows only localhost brokers", () => {
    assert.equal(assertLocalMqttUrl("mqtt://127.0.0.1:1883").ok, true);
    assert.equal(assertLocalMqttUrl("mqtt://localhost:1883").ok, true);
    const remote = assertLocalMqttUrl("mqtt://example.com:1883");
    assert.equal(remote.ok, false);
    if (!remote.ok) assert.equal(remote.error, "broker-forbidden");
    const empty = assertLocalMqttUrl("");
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error, "broker-unconfigured");
  });
});

describe("gateway outbound buffer", () => {
  it("retries after a 5xx and persists to disk", async () => {
    assert.equal(shouldBufferStatus(503), true);
    assert.equal(shouldBufferStatus(401), false);
    const dir = mkdtempSync(join(tmpdir(), "gw-buf-"));
    const path = join(dir, "buffer.json");
    const buffer = createOutboundBuffer({ path, limit: 10 });
    buffer.push({ kind: "state", extra: { externalId: "wb-msw3" } });
    assert.equal(buffer.size(), 1);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).length, 1);
    const sent: string[] = [];
    let fail = true;
    await buffer.flush(async (kind) => {
      if (fail) {
        fail = false;
        throw new Error("503");
      }
      sent.push(kind);
    }).catch(() => undefined);
    assert.equal(buffer.size(), 1);
    await buffer.flush(async (kind) => {
      sent.push(kind);
    });
    assert.equal(buffer.size(), 0);
    assert.deepEqual(sent, ["state"]);
  });
});
