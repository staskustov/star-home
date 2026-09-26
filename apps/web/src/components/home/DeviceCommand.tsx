"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand } from "@/lib/command";
import type { SmartCommandName } from "@/server/smart-commands";

export function DeviceCommand({
  deviceId,
  commands,
  canCommand,
  state,
}: {
  deviceId: string;
  commands: SmartCommandName[];
  canCommand: boolean;
  state?: { on?: boolean; brightness?: number; targetC?: number; position?: number; latch?: string };
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState<{ command: SmartCommandName; value?: unknown } | null>(null);

  async function send(command: SmartCommandName, value?: unknown, confirmToken?: string) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${deviceId}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, value, confirmToken }),
      }),
    );
    const payload = result.payload;
    if (payload?.needsConfirm && typeof payload.token === "string") {
      setToken(payload.token);
      setPending({ command, value });
      setNotice("Подтвердите команду.");
      return;
    }
    setToken(null);
    setPending(null);
    setNotice(commandMessage(payload));
    if (result.ok && payload?.confirmed) router.refresh();
  }

  if (!canCommand || commands.length === 0) {
    return <p className="text-[14px] text-muted">Управление недоступно.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {commands.includes("setPower") ? (
          <>
            <button type="button" className="btn btn-primary btn-compact" onClick={() => void send("setPower", true)}>
              Включить
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void send("setPower", false)}>
              Выключить
            </button>
          </>
        ) : null}
        {commands.includes("open") ? (
          <button type="button" className="btn btn-primary btn-compact" onClick={() => void send("open")}>
            Открыть
          </button>
        ) : null}
        {commands.includes("close") ? (
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => void send("close")}>
            Закрыть
          </button>
        ) : null}
        {commands.includes("stop") ? (
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => void send("stop")}>
            Стоп
          </button>
        ) : null}
      </div>
      {commands.includes("setBrightness") ? (
        <label className="block text-[13px] text-muted">
          Яркость
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={state?.brightness ?? 50}
            className="mt-2 w-full"
            onMouseUp={(event) => void send("setBrightness", Number(event.currentTarget.value))}
            onTouchEnd={(event) => void send("setBrightness", Number(event.currentTarget.value))}
          />
        </label>
      ) : null}
      {commands.includes("setTemperature") ? (
        <label className="block text-[13px] text-muted">
          Температура
          <input
            type="number"
            step={0.5}
            defaultValue={state?.targetC ?? 22}
            className="control mt-2"
            onBlur={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value)) void send("setTemperature", value);
            }}
          />
        </label>
      ) : null}
      {commands.includes("setPosition") ? (
        <label className="block text-[13px] text-muted">
          Положение
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={state?.position ?? 0}
            className="mt-2 w-full"
            onMouseUp={(event) => void send("setPosition", Number(event.currentTarget.value))}
            onTouchEnd={(event) => void send("setPosition", Number(event.currentTarget.value))}
          />
        </label>
      ) : null}
      {token && pending ? (
        <button type="button" className="btn btn-primary btn-compact" onClick={() => void send(pending.command, pending.value, token)}>
          Подтвердить
        </button>
      ) : null}
      {notice ? (
        <p role="status" className="text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
