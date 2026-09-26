"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { commandMessage, runCommand } from "@/lib/command";
import { deviceStatus, statusClass, statusDot } from "@/lib/device-status";

const kindIcon: Record<string, IconName> = {
  GATE: "gate",
  WICKET: "gate",
  BARRIER: "gate",
  LOCK: "lock",
  CLIMATE: "climate",
  CAMERA: "camera",
  LEAK: "leak",
  LIGHTING: "devices",
  CURTAIN: "rooms",
  Ворота: "gate",
  Калитка: "gate",
  Шлагбаум: "gate",
  Замок: "lock",
  Климат: "climate",
  Камера: "camera",
  Протечка: "leak",
  Освещение: "devices",
  Шторы: "rooms",
};

export type InstantDeviceRow = {
  id?: string;
  name: string;
  label: string;
  kind?: string;
  state: "ON" | "OFF" | "FAULT";
  power?: boolean;
  latch?: "OPEN" | "CLOSED";
  commands?: string[];
  stale?: boolean;
};

export function InstantDevice({
  device,
  canGate = false,
  canCommand = false,
  href,
}: {
  device: InstantDeviceRow;
  canGate?: boolean;
  canCommand?: boolean;
  href?: string;
}) {
  const [power, setPower] = useState(device.power);
  const [latch, setLatch] = useState(device.latch);
  const [notice, setNotice] = useState<string | null>(null);
  const commands = device.commands ?? [];
  const switchable = canCommand && commands.includes("setPower");
  const opener = Boolean(latch !== undefined || commands.includes("open") || commands.includes("close"));
  const status = deviceStatus({ stale: device.stale, work: device.state, power: switchable ? Boolean(power) : power, latch });
  const icon = kindIcon[device.kind ?? ""] ?? kindIcon[device.label] ?? "devices";

  async function togglePower(on: boolean) {
    if (!device.id) return;
    const previous = power;
    setPower(on);
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${device.id}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "setPower", value: on }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) {
      setPower(previous);
      setNotice(commandMessage(result.payload));
    }
  }

  async function setOpen(open: boolean) {
    if (!device.id) return;
    const previous = latch;
    setLatch(open ? "OPEN" : "CLOSED");
    setNotice(null);
    const result = await runCommand(() =>
      fetch(open ? "/api/access/points" : `/api/access/points/${device.id}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pointId: device.id }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) {
      setLatch(previous);
      setNotice(commandMessage(result.payload));
    }
  }

  const body = (
    <>
      <span className="tile-icon">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{device.name}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{device.label}</span>
      </span>
      <span className={`flex shrink-0 items-center gap-2 text-[14px] ${statusClass(status.tone)}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(status.tone)}`} aria-hidden />
        {status.text}
      </span>
    </>
  );

  return (
    <div>
      <div className="flex min-w-0 items-center gap-[14px]">
        {href && device.id ? (
          <Link href={href} className="-my-1 flex min-w-0 flex-1 items-center gap-[14px] py-1">
            {body}
            <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        ) : (
          body
        )}
      </div>
      {switchable || (canGate && opener && device.state === "ON" && !device.stale) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {switchable ? (
            <>
              <button type="button" className="btn btn-primary btn-compact" disabled={power === true} onClick={() => void togglePower(true)}>
                Включить
              </button>
              <button type="button" className="btn btn-secondary btn-compact" disabled={power === false} onClick={() => void togglePower(false)}>
                Выключить
              </button>
            </>
          ) : null}
          {canGate && opener && device.state === "ON" && !device.stale ? (
            <>
              <button type="button" className="btn btn-primary btn-compact" disabled={latch === "OPEN"} onClick={() => void setOpen(true)}>
                Открыть
              </button>
              <button type="button" className="btn btn-secondary btn-compact" disabled={latch === "CLOSED"} onClick={() => void setOpen(false)}>
                Закрыть
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
