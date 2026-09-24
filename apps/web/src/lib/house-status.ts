import type { LifeMode, Tone } from "@/types/domain";

export function houseReadout(
  devices: { name: string; state: "ON" | "OFF" | "FAULT" }[],
  mode: { mode: LifeMode; summary: string; detail: string; securityTone: Tone },
) {
  const fault = devices.find((device) => device.state === "FAULT");
  if (fault) {
    return { summary: "Есть проблема", tone: "danger" as const, detail: fault.name, security: "Есть проблема" };
  }
  return {
    summary: mode.summary,
    tone: mode.securityTone,
    detail: mode.detail,
    security: mode.mode === "VACATION" ? "Усиленная защита" : "Дом защищён",
  };
}
