"use client";

import { useState, type PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand } from "@/lib/command";

type Pin = { deviceId: string; name: string; x: number; y: number };
type Floor = { floor: number; image: string; pins: Pin[] };

export function FloorPlan({
  floors,
  editable = false,
}: {
  floors: Floor[];
  editable?: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ deviceId: string; floor: number } | null>(null);

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
    setNotice(result.ok ? "Метка сохранена." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  function pointFromEvent(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  }

  return (
    <div className="mt-4 space-y-4">
      {floors.map((plan) => (
        <figure key={plan.floor} className="panel overflow-hidden">
          <figcaption className="px-5 py-3 text-[15px] text-ink">{plan.floor} этаж</figcaption>
          <div
            className="relative"
            onPointerUp={(event) => {
              if (!editable || !drag || drag.floor !== plan.floor) return;
              const next = pointFromEvent(event);
              const deviceId = drag.deviceId;
              setDrag(null);
              void place(deviceId, plan.floor, next.x, next.y);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plan.image} alt={`План ${plan.floor} этажа`} className="block w-full" />
            {plan.pins.map((pin) =>
              editable ? (
                <button
                  key={pin.deviceId}
                  type="button"
                  title={pin.name}
                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  onPointerDown={() => setDrag({ deviceId: pin.deviceId, floor: plan.floor })}
                >
                  <span className="sr-only">{pin.name}</span>
                </button>
              ) : (
                <Link
                  key={pin.deviceId}
                  href={`/devices/${pin.deviceId}`}
                  title={pin.name}
                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                >
                  <span className="sr-only">{pin.name}</span>
                </Link>
              ),
            )}
          </div>
        </figure>
      ))}
      {notice ? <p className="text-[13px] text-muted">{notice}</p> : null}
    </div>
  );
}
