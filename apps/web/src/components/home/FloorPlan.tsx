"use client";

import { useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { GoogleIcon } from "@/components/GoogleIcon";
import { commandMessage, runCommand } from "@/lib/command";
import { deviceIconColorOf } from "@/lib/google-icons";
import { isClimateKind, isLightingKind, type PlanMetric, type PlanPin } from "@/lib/plan-pin";

type Floor = { floor: number; image: string; pins: PlanPin[] };

export type FloorPlanPlacing = {
  deviceId: string;
  floor: number;
  kind?: string;
  icon?: string | null;
  iconColor?: string | null;
  name?: string;
};

function pinShift(x: number, y: number) {
  const ox = x > 78 ? "-100%" : x < 18 ? "0" : "-50%";
  const oy = y > 82 ? "-100%" : y < 10 ? "0" : "-8px";
  return `translate(${ox}, ${oy})`;
}

export function FloorPlan({
  floors,
  editable = false,
  canCommand = false,
  placing = null,
  onPlaced,
}: {
  floors: Floor[];
  editable?: boolean;
  canCommand?: boolean;
  placing?: FloorPlanPlacing | null;
  onPlaced?: () => void;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [openMetric, setOpenMetric] = useState<{ deviceId: string; key: string } | null>(null);
  const [power, setPower] = useState<Record<string, boolean>>({});
  const [ghost, setGhost] = useState<{ floor: number; x: number; y: number } | null>(null);
  const dragging = useRef(false);

  if (!floors.length) {
    return <p className="panel mt-4 px-5 py-5 text-[15px] text-muted">Планировка для этого дома ещё не загружена.</p>;
  }

  async function place(deviceId: string, floor: number, x: number, y: number) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${deviceId}/place`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planFloor: floor, planX: Math.round(x), planY: Math.round(y) }),
      }),
    );
    setNotice(result.ok ? "Устройство стоит на плане." : commandMessage(result.payload));
    if (result.ok) {
      onPlaced?.();
      router.refresh();
    }
  }

  async function toggleLight(pin: PlanPin) {
    if (!canCommand || !pin.canToggle) return;
    const current = power[pin.deviceId] ?? pin.on === true;
    const next = !current;
    setPower((map) => ({ ...map, [pin.deviceId]: next }));
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${pin.deviceId}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "setPower", value: next }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) {
      setPower((map) => ({ ...map, [pin.deviceId]: current }));
      setNotice(commandMessage(result.payload));
    }
  }

  function pointFromEvent(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  }

  function startPlace(event: PointerEvent<HTMLDivElement>, floor: number) {
    if (!placing || placing.floor !== floor) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional; click-to-place still works */
    }
    dragging.current = true;
    setGhost({ floor, ...pointFromEvent(event) });
  }

  function movePlace(event: PointerEvent<HTMLDivElement>, floor: number) {
    if (!dragging.current || !placing || placing.floor !== floor) return;
    setGhost({ floor, ...pointFromEvent(event) });
  }

  function endPlace(event: PointerEvent<HTMLDivElement>, floor: number) {
    if (!dragging.current || !placing || placing.floor !== floor) return;
    dragging.current = false;
    const next = pointFromEvent(event);
    setGhost(null);
    void place(placing.deviceId, floor, next.x, next.y);
  }

  return (
    <div className="mt-4 space-y-4">
      {floors.map((plan) => {
        const dropHere = Boolean(placing && placing.floor === plan.floor);
        return (
          <figure key={plan.floor} className={`panel overflow-hidden ${dropHere ? "ring-2 ring-accent/70" : ""}`}>
            <figcaption className="flex items-center justify-between gap-3 px-5 py-3 text-[15px] text-ink">
              <span>{plan.floor} этаж</span>
              {dropHere ? <span className="text-[13px] text-muted">Нажмите и перетащите</span> : null}
            </figcaption>
            <div
              className={`relative select-none ${dropHere ? "cursor-grab active:cursor-grabbing" : ""}`}
              style={{ touchAction: dropHere ? "none" : undefined }}
              onPointerDown={(event) => startPlace(event, plan.floor)}
              onPointerMove={(event) => movePlace(event, plan.floor)}
              onPointerUp={(event) => endPlace(event, plan.floor)}
              onPointerCancel={() => {
                dragging.current = false;
                setGhost(null);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={plan.image} alt={`План ${plan.floor} этажа`} className="block w-full" draggable={false} />
              {plan.pins.map((pin) => (
                <div
                  key={pin.deviceId}
                  className={`absolute z-[1] ${placing ? "pointer-events-none" : ""}`}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: pinShift(pin.x, pin.y) }}
                >
                  <PlanMark
                    pin={pin}
                    on={power[pin.deviceId] ?? pin.on === true}
                    openKey={openMetric?.deviceId === pin.deviceId ? openMetric.key : null}
                    canCommand={canCommand}
                    onOpenMetric={(key) =>
                      setOpenMetric((current) => (current?.deviceId === pin.deviceId && current.key === key ? null : { deviceId: pin.deviceId, key }))
                    }
                    onToggle={() => void toggleLight(pin)}
                  />
                </div>
              ))}
              {ghost && ghost.floor === plan.floor && placing ? (
                <div className="pointer-events-none absolute z-[2]" style={{ left: `${ghost.x}%`, top: `${ghost.y}%`, transform: pinShift(ghost.x, ghost.y) }}>
                  <PlanMark
                    pin={{
                      deviceId: placing.deviceId,
                      name: placing.name ?? "Устройство",
                      x: ghost.x,
                      y: ghost.y,
                      kind: placing.kind ?? "",
                      icon: placing.icon,
                      iconColor: placing.iconColor,
                      on: true,
                      canToggle: false,
                      metrics: [],
                    }}
                    on={isLightingKind(placing.kind ?? "")}
                    openKey={null}
                    canCommand={false}
                    ghost
                    onOpenMetric={() => undefined}
                    onToggle={() => undefined}
                  />
                </div>
              ) : null}
            </div>
          </figure>
        );
      })}
      {editable && placing ? <p className="text-[13px] text-muted">Отпустите кнопку мыши, чтобы поставить устройство.</p> : null}
      {notice ? <p className="text-[13px] text-muted">{notice}</p> : null}
    </div>
  );
}

function PlanMark({
  pin,
  on,
  openKey,
  canCommand,
  ghost = false,
  onOpenMetric,
  onToggle,
}: {
  pin: PlanPin;
  on: boolean;
  openKey: string | null;
  canCommand: boolean;
  ghost?: boolean;
  onOpenMetric: (key: string) => void;
  onToggle: () => void;
}) {
  const tint = deviceIconColorOf(pin.iconColor);
  if (isLightingKind(pin.kind)) {
    return (
      <button
        type="button"
        title={on ? `${pin.name} · включен` : `${pin.name} · выключен`}
        className={`plan-light ${on ? "is-on" : ""} ${ghost ? "opacity-80" : ""}`}
        style={
          tint
            ? {
                color: tint,
                ...(on
                  ? {
                      background: `color-mix(in srgb, ${tint} 28%, rgba(255, 251, 245, 0.96))`,
                      boxShadow: `0 0 0 5px color-mix(in srgb, ${tint} 22%, transparent), 0 10px 24px color-mix(in srgb, ${tint} 38%, transparent)`,
                    }
                  : {}),
              }
            : undefined
        }
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (!ghost && canCommand) onToggle();
        }}
      >
        <GoogleIcon name={pin.icon} kind={pin.kind} filled={on} size={22} color={tint} />
        <span className="sr-only">{pin.name}</span>
      </button>
    );
  }

  if (isClimateKind(pin.kind) && pin.metrics.length) {
    return (
      <div className={`plan-climate ${ghost ? "opacity-80" : ""}`} onPointerDown={(event) => event.stopPropagation()}>
        {pin.metrics.map((metric) => (
          <ClimateMetric key={metric.key} metric={metric} open={openKey === metric.key} onOpen={() => onOpenMetric(metric.key)} />
        ))}
      </div>
    );
  }

  if (ghost && isClimateKind(pin.kind)) {
    return (
      <div className="plan-climate opacity-80">
        <span className="px-2 py-1 text-[12px] text-ink">{pin.name}</span>
      </div>
    );
  }

  return (
    <span
      title={pin.name}
      className={`plan-dot ${ghost ? "opacity-80" : ""}`}
      style={tint ? { color: tint } : undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <GoogleIcon name={pin.icon} kind={pin.kind} size={16} color={tint} />
      <span className="sr-only">{pin.name}</span>
    </span>
  );
}

function ClimateMetric({ metric, open, onOpen }: { metric: PlanMetric; open: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`plan-metric ${open ? "is-open" : ""}`} style={{ color: metric.color }} onClick={onOpen} title={metric.label}>
      <Icon name={metric.icon as IconName} className={open ? "h-7 w-7" : "h-4 w-4"} />
      <span className="plan-metric-value">{metric.value}</span>
      {open ? <span className="plan-metric-label">{metric.label}</span> : null}
    </button>
  );
}
