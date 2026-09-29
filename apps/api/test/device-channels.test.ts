import "./register-paths";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferKindFromCapabilities, residentSeesDevice } from "../../web/src/server/device-kinds";
import { normalizeAiQuery } from "../../web/src/server/ai-intent";
import { deviceCan } from "../../web/src/server/smart-commands";
import {
  channelsOf,
  findDuplicateDevice,
  normalizeCapabilityName,
  persistChannels,
  publicChannelsOf,
  synthesizeChannels,
  unitForCapability,
} from "../../web/src/server/device-channels";

describe("device channel model", () => {
  it("normalizes vendor names to capabilities and units", () => {
    assert.equal(normalizeCapabilityName("Temperature"), "temperature");
    assert.equal(normalizeCapabilityName("temp"), "temperature");
    assert.equal(normalizeCapabilityName("T"), "temperature");
    assert.equal(normalizeCapabilityName("CO2"), "co2");
    assert.equal(normalizeCapabilityName("Illuminance"), "illuminance");
    assert.equal(normalizeCapabilityName("Lux"), "illuminance");
    assert.equal(unitForCapability("temperature"), "°C");
    assert.equal(unitForCapability("humidity"), "%");
    assert.equal(unitForCapability("illuminance"), "lx");
    assert.equal(unitForCapability("co2"), "ppm");
  });

  it("does not treat a missing temperature as zero", () => {
    const empty = publicChannelsOf({
      id: "dev_empty",
      capabilities: ["temperature", "humidity"],
      state: { temperatureC: null as unknown as number },
      availability: "UNKNOWN",
    });
    const temperature = empty.find((channel) => channel.capability === "temperature");
    assert.equal(temperature?.value, null);
    assert.equal(temperature?.status, "NONE");
    assert.equal(temperature?.quality, "unknown");
    assert.notEqual(temperature?.value, 0);
    const offline = publicChannelsOf({
      id: "dev_off",
      capabilities: ["temperature"],
      availability: "OFFLINE",
    });
    assert.equal(offline[0]?.value, null);
    assert.equal(offline[0]?.quality, "unavailable");
  });

  it("keeps one physical device with many synthesized channels", () => {
    const device = {
      id: "dev_msw",
      capabilities: ["temperature", "humidity", "illuminance", "co2"] as const,
      state: { temperatureC: 22.4, humidityPercent: 48, illuminanceLx: 320, co2Ppm: 650 },
    };
    const channels = synthesizeChannels({ ...device, capabilities: [...device.capabilities] });
    assert.equal(channels.length, 4);
    assert.deepEqual(
      channels.map((channel) => [channel.capability, channel.unit, channel.value]),
      [
        ["temperature", "°C", 22.4],
        ["humidity", "%", 48],
        ["illuminance", "lx", 320],
        ["co2", "ppm", 650],
      ],
    );
    assert.equal(publicChannelsOf({ ...device, capabilities: [...device.capabilities] }).every((channel) => !("externalId" in channel) && !("metadata" in channel)), true);
  });

  it("does not persist synthesis onto a device that has no channels", () => {
    const device = { id: "dev_old", capabilities: ["temperature" as const], state: { temperatureC: 21 } };
    assert.equal(device.channels, undefined);
    assert.equal(channelsOf(device).length, 1);
    assert.equal(device.channels, undefined);
  });

  it("writes channels only when persistChannels is called", () => {
    const device = { id: "dev_new", capabilities: ["temperature" as const, "humidity" as const], state: { temperatureC: 20, humidityPercent: 40 } };
    persistChannels(device);
    assert.equal(device.channels?.length, 2);
    assert.equal(device.state?.temperatureC, 20);
  });

  it("hides object engineering from the resident and keeps gates", () => {
    assert.equal(residentSeesDevice({ kind: "GATE", unitId: null }), true);
    assert.equal(residentSeesDevice({ kind: "WEATHER", unitId: null }), true);
    assert.equal(residentSeesDevice({ kind: "POWER", unitId: null }), false);
    assert.equal(residentSeesDevice({ kind: "WATER", unitId: null, metadata: { engineering: true } }), false);
    assert.equal(residentSeesDevice({ kind: "POWER", unitId: "unit_24" }), true);
  });

  it("infers a device kind from discovered capabilities", () => {
    assert.equal(inferKindFromCapabilities(["temperature", "humidity", "illuminance", "co2"]), "CLIMATE");
    assert.equal(inferKindFromCapabilities(["latch"]), "GATE");
    assert.equal(inferKindFromCapabilities(["wind", "radiation"]), "WEATHER");
    assert.equal(inferKindFromCapabilities(["brightness", "power"]), "LIGHTING");
  });

  it("rejects mqtt queries and commands on read-only channels", () => {
    assert.equal(normalizeAiQuery("get_room_climate"), "room_climate");
    assert.equal(normalizeAiQuery("get_device_channels"), "device_channels");
    assert.equal(normalizeAiQuery("get_mqtt"), null);
    const device = {
      id: "dev_thermo",
      companyId: "cmp_star",
      objectId: "obj_siyanie",
      unitId: "unit_24",
      kind: "CLIMATE" as const,
      name: "Климат",
      adapter: "local" as const,
      capabilities: ["temperature", "thermostat"] as const,
      channels: [
        { id: "ch1", deviceId: "dev_thermo", externalId: "T", name: "temperature", displayName: "Температура", capability: "temperature" as const, unit: "°C", dataType: "number" as const, readable: true, writable: false, enabled: true, status: "LIVE" as const },
        { id: "ch2", deviceId: "dev_thermo", externalId: "Set", name: "thermostat", displayName: "Термостат", capability: "thermostat" as const, unit: "°C", dataType: "number" as const, readable: true, writable: false, enabled: true, status: "LIVE" as const },
      ],
    };
    assert.equal(deviceCan(device, "setTemperature"), false);
  });

  it("matches duplicates by gateway and external id", () => {
    const devices = [
      { id: "a", gatewayId: "gw_1", externalId: "wb-msw3" },
      { id: "b", gatewayId: "gw_1", externalId: "other" },
    ];
    assert.equal(findDuplicateDevice(devices, "gw_1", "wb-msw3")?.id, "a");
    assert.equal(findDuplicateDevice(devices, "gw_1", "wb-msw3", "a"), undefined);
    assert.equal(findDuplicateDevice(devices, null, "wb-msw3"), undefined);
  });
});
