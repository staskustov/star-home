"use client";

import { useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CameraViewer, orderCameras, type HomeCamera } from "@/components/home/CameraViewer";
import { Icon, type IconName } from "@/components/icons";
import { GoogleIcon } from "@/components/GoogleIcon";
import { commandMessage, runCommand } from "@/lib/command";
import { deviceIconColorOf } from "@/lib/google-icons";
import { isCameraKind, isClimateKind, isLightingKind, type PlanMetric, type PlanPin } from "@/lib/plan-pin";

type Floor = { floor: number; image: string; pins: PlanPin[] };

export type FloorPlanPlacing = {
  deviceId: string;
  floor: number;
  kind?: string;
  icon?: string | null;
  iconColor?: string | null;
  name?: string;
};

type Moving = { pin: PlanPin; floor: number; startX: number; startY: number; moved: boolean };

const dragThresholdPx = 5;

function pinShift(x: number, y: number) {
  const ox = x > 78 ? "-100%" : x < 18 ? "0" : "-50%";
  const oy = y > 82 ? "-100%" : y < 10 ? "0" : "-8px";
  return `translate(${ox}, ${oy})`;
}

function pointIn(box: DOMRect, clientX: number, clientY: number) {
  const x = ((clientX - box.left) / box.width) * 100;
  const y = ((clientY - box.top) / box.height) * 100;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
}

export function PlanThumbnail({
  image,
  alt,
  pins,
  canCommand = false,
  cameras = [],
}: {
  image: string;
  alt: string;
  pins: PlanPin[];
  canCommand?: boolean;
  cameras?: HomeCamera[];
}) {
  const [power, setPower] = useState<Record<string, boolean>>({});
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const ordered = orderCameras(cameras);

  async function toggleLight(pin: PlanPin) {
    if (!canCommand || !pin.canToggle) return;
    const current = power[pin.deviceId] ?? pin.on === true;
    const next = !current;
    setPower((map) => ({ ...map, [pin.deviceId]: next }));
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${pin.deviceId}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "setPower", value: next }),
      }),
    );
    if (!result.ok || result.payload?.confirmed !== true) {
      setPower((map) => ({ ...map, [pin.deviceId]: current }));
    }
  }

  function openCamera(deviceId: string) {
    const index = ordered.findIndex((item) => item.id === deviceId);
    if (index >= 0) setCameraIndex(index);
  }

  return (
    <>
      <div className="home-plan plan-compact relative w-full min-w-0 shrink-0 overflow-hidden rounded-2xl sm:w-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={alt} className="block h-auto w-full sm:h-full sm:w-auto" />
        {pins.map((pin) => (
          <div key={pin.deviceId} className="absolute z-[1]" style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: pinShift(pin.x, pin.y) }}>
            <PlanMark
              pin={pin}
              on={power[pin.deviceId] ?? pin.on === true}
              openKey={null}
              canCommand={canCommand}
              readOnly={isClimateKind(pin.kind)}
              onOpenMetric={() => undefined}
              onToggle={() => void toggleLight(pin)}
              onCamera={() => openCamera(pin.deviceId)}
            />
          </div>
        ))}
      </div>
      {cameraIndex !== null ? (
        <CameraViewer cameras={ordered} index={cameraIndex} onClose={() => setCameraIndex(null)} onSelect={setCameraIndex} />
      ) : null}
    </>
  );
}

export function FloorPlan({
  floors,
  editable = false,
  canCommand = false,
  cameras = [],
  placing = null,
  switcher = false,
  onPlaced,
}: {
  floors: Floor[];
  editable?: boolean;
  canCommand?: boolean;
  cameras?: HomeCamera[];
  placing?: FloorPlanPlacing | null;
  switcher?: boolean;
  onPlaced?: () => void;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [openMetric, setOpenMetric] = useState<{ deviceId: string; key: string } | null>(null);
  const [power, setPower] = useState<Record<string, boolean>>({});
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ floor: number; x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [floorIndex, setFloorIndex] = useState(0);
  const dragging = useRef(false);
  const movingRef = useRef<Moving | null>(null);
  const swallowClick = useRef(false);
  const canMove = editable && !placing;
  const orderedCameras = orderCameras(cameras);

  const [seenFloors, setSeenFloors] = useState(floors);
  if (seenFloors !== floors) {
    setSeenFloors(floors);
    setMoved({});
    setFloorIndex(0);
  }

  if (!floors.length) {
    return <p className="panel mt-4 px-5 py-5 text-[15px] text-muted">Планировка для этого дома ещё не загружена.</p>;
  }

  const activeIndex = Math.min(floorIndex, floors.length - 1);
  const visible = switcher ? [floors[activeIndex]!] : floors;

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
    return result.ok;
  }

  function startMove(event: PointerEvent<HTMLDivElement>, pin: PlanPin, floor: number) {
    if (!canMove || event.button > 0) return;
    const next = { pin, floor, startX: event.clientX, startY: event.clientY, moved: false };
    movingRef.current = next;
    setMoving(next);
  }

  function dragMove(event: PointerEvent<HTMLDivElement>) {
    const current = movingRef.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < dragThresholdPx) return;
    const plan = event.currentTarget.parentElement;
    if (!plan) return;
    if (!current.moved) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is optional */
      }
    }
    current.moved = true;
    setGhost({ floor: current.floor, ...pointIn(plan.getBoundingClientRect(), event.clientX, event.clientY) });
  }

  async function endMove(event: PointerEvent<HTMLDivElement>) {
    const current = movingRef.current;
    movingRef.current = null;
    setMoving(null);
    setGhost(null);
    const plan = event.currentTarget.parentElement;
    if (!current?.moved || !plan) return;
    swallowClick.current = true;
    const next = pointIn(plan.getBoundingClientRect(), event.clientX, event.clientY);
    setMoved((map) => ({ ...map, [current.pin.deviceId]: next }));
    const saved = await place(current.pin.deviceId, current.floor, next.x, next.y);
    if (!saved) {
      setMoved((map) => {
        const rest = { ...map };
        delete rest[current.pin.deviceId];
        return rest;
      });
    }
  }

  function cancelMove() {
    movingRef.current = null;
    setMoving(null);
    setGhost(null);
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

  function openCamera(deviceId: string) {
    const index = orderedCameras.findIndex((item) => item.id === deviceId);
    if (index >= 0) setCameraIndex(index);
  }

  function pointFromEvent(event: PointerEvent<HTMLDivElement>) {
    return pointIn(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
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
    <div className={switcher ? "space-y-3" : "mt-4 space-y-4"}>
      {switcher && floors.length > 1 ? (
        <div className="chip-row w-full justify-center md:w-full" role="tablist" aria-label="Этаж плана">
          {floors.map((plan, index) => {
            const selected = index === activeIndex;
            return (
              <button
                key={plan.floor}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-checked={selected}
                className="segment-item"
                onClick={() => setFloorIndex(index)}
              >
                {plan.floor} этаж
              </button>
            );
          })}
        </div>
      ) : null}
      {visible.map((plan) => {
        const dropHere = Boolean(placing && placing.floor === plan.floor);
        return (
          <figure key={plan.floor} className={`panel overflow-hidden ${dropHere ? "ring-2 ring-accent/70" : ""}`}>
            {switcher ? null : (
              <figcaption className="flex items-center justify-between gap-3 px-5 py-3 text-[15px] text-ink">
                <span>{plan.floor} этаж</span>
                {dropHere ? <span className="text-[13px] text-muted">Нажмите и перетащите</span> : null}
              </figcaption>
            )}
            <div
              className={`floor-plan relative select-none ${dropHere ? "cursor-grab active:cursor-grabbing" : ""}`}
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
              {plan.pins.map((pin) => {
                const at = moved[pin.deviceId] ?? pin;
                const lifted = moving?.pin.deviceId === pin.deviceId && ghost !== null;
                return (
                <div
                  key={pin.deviceId}
                  className={`absolute z-[1] ${placing ? "pointer-events-none" : ""} ${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${lifted ? "opacity-30" : ""}`}
                  style={{ left: `${at.x}%`, top: `${at.y}%`, transform: pinShift(at.x, at.y), touchAction: canMove ? "none" : undefined }}
                  onPointerDownCapture={(event) => startMove(event, pin, plan.floor)}
                  onPointerMove={dragMove}
                  onPointerUp={(event) => void endMove(event)}
                  onPointerCancel={cancelMove}
                  onClickCapture={(event) => {
                    if (!swallowClick.current) return;
                    swallowClick.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
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
                    onCamera={() => openCamera(pin.deviceId)}
                  />
                </div>
                );
              })}
              {ghost && ghost.floor === plan.floor && moving ? (
                <div className="pointer-events-none absolute z-[2]" style={{ left: `${ghost.x}%`, top: `${ghost.y}%`, transform: pinShift(ghost.x, ghost.y) }}>
                  <PlanMark
                    pin={moving.pin}
                    on={power[moving.pin.deviceId] ?? moving.pin.on === true}
                    openKey={null}
                    canCommand={false}
                    ghost
                    onOpenMetric={() => undefined}
                    onToggle={() => undefined}
                  />
                </div>
              ) : null}
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
      {canMove && floors.some((plan) => plan.pins.length) ? <p className="text-[13px] text-muted">Перетащите иконку на плане, чтобы передвинуть устройство.</p> : null}
      {notice ? <p className="text-[13px] text-muted">{notice}</p> : null}
      {cameraIndex !== null ? (
        <CameraViewer cameras={orderedCameras} index={cameraIndex} onClose={() => setCameraIndex(null)} onSelect={setCameraIndex} />
      ) : null}
    </div>
  );
}

function PlanMark({
  pin,
  on,
  openKey,
  canCommand,
  ghost = false,
  readOnly = false,
  onOpenMetric,
  onToggle,
  onCamera,
}: {
  pin: PlanPin;
  on: boolean;
  openKey: string | null;
  canCommand: boolean;
  ghost?: boolean;
  readOnly?: boolean;
  onOpenMetric: (key: string) => void;
  onToggle: () => void;
  onCamera?: () => void;
}) {
  const tint = deviceIconColorOf(pin.iconColor);
  if (isLightingKind(pin.kind)) {
    const className = `plan-light ${on ? "is-on" : ""} ${ghost ? "opacity-80" : ""}`;
    const style = tint
      ? {
          color: tint,
          ...(on
            ? {
                background: `color-mix(in srgb, ${tint} 28%, rgba(255, 251, 245, 0.96))`,
                boxShadow: `0 0 0 calc(5px * var(--pin-scale, 1)) color-mix(in srgb, ${tint} 22%, transparent), 0 10px 24px color-mix(in srgb, ${tint} 38%, transparent)`,
              }
            : {}),
        }
      : undefined;
    const body = (
      <>
        <GoogleIcon name={pin.icon} kind={pin.kind} filled={on} color={tint} />
        <span className="sr-only">{pin.name}</span>
      </>
    );
    if (readOnly) {
      return (
        <span title={pin.name} className={className} style={style}>
          {body}
        </span>
      );
    }
    return (
      <button
        type="button"
        title={on ? `${pin.name} · включен` : `${pin.name} · выключен`}
        className={className}
        style={style}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (!ghost && canCommand) onToggle();
        }}
      >
        {body}
      </button>
    );
  }

  if (isClimateKind(pin.kind) && pin.metrics.length) {
    return (
      <div className={`plan-climate ${ghost ? "opacity-80" : ""}`} onPointerDown={(event) => event.stopPropagation()}>
        {pin.metrics.map((metric) => (
          <ClimateMetric key={metric.key} metric={metric} open={openKey === metric.key} readOnly={readOnly} onOpen={() => onOpenMetric(metric.key)} />
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

  if (isCameraKind(pin.kind) && !ghost) {
    return (
      <button
        type="button"
        title={pin.name}
        className="plan-dot plan-camera"
        style={tint ? { color: tint } : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCamera?.();
        }}
      >
        <GoogleIcon name={pin.icon} kind={pin.kind} color={tint} />
        <span className="sr-only">{pin.name}</span>
      </button>
    );
  }

  return (
    <span
      title={pin.name}
      className={`plan-dot ${ghost ? "opacity-80" : ""}`}
      style={tint ? { color: tint } : undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <GoogleIcon name={pin.icon} kind={pin.kind} color={tint} />
      <span className="sr-only">{pin.name}</span>
    </span>
  );
}

function ClimateMetric({ metric, open, readOnly, onOpen }: { metric: PlanMetric; open: boolean; readOnly: boolean; onOpen: () => void }) {
  const body = (
    <>
      <Icon name={metric.icon as IconName} className="plan-metric-icon" />
      <span className="plan-metric-value">{metric.value}</span>
      {open ? <span className="plan-metric-label">{metric.label}</span> : null}
    </>
  );
  if (readOnly) {
    return (
      <span className="plan-metric" style={{ color: metric.color }} title={metric.label}>
        {body}
      </span>
    );
  }
  return (
    <button type="button" className={`plan-metric ${open ? "is-open" : ""}`} style={{ color: metric.color }} onClick={onOpen} title={metric.label}>
      {body}
    </button>
  );
}
