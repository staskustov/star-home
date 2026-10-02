"use client";

import Link from "next/link";
import { FloorPlan } from "@/components/home/FloorPlan";
import { HomeSection } from "@/components/home/HomeSection";
import { MetricChip, metricLook, type MetricStyle } from "@/components/home/MetricChip";
import type { HomeCamera } from "@/components/home/CameraViewer";
import type { PlanPin } from "@/lib/plan-pin";
import { Icon } from "@/components/icons";
import { formatHumidity, formatTemperature } from "@/lib/format";

function devicesLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} устройство`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} устройства`;
  return `${count} устройств`;
}

type Plan = { floor: number; image: string; pins: PlanPin[] };
type Room = { id?: string; name: string; deviceCount?: number; temperatureC?: number | null; humidityPercent?: number | null };

export function HomeHero({
  unitName,
  rooms,
  plans = [],
  temperatureC,
  humidityPercent,
  metrics,
  canCommand = false,
  cameras = [],
  className = "",
}: {
  unitName: string;
  rooms: Room[];
  plans?: Plan[];
  temperatureC: number | null;
  humidityPercent: number | null;
  metrics?: MetricStyle[];
  canCommand?: boolean;
  cameras?: HomeCamera[];
  className?: string;
}) {
  const deviceCount = rooms.reduce((sum, room) => sum + (room.deviceCount ?? 0), 0);
  const temp = metricLook(metrics, "temperature");
  const humidity = metricLook(metrics, "humidity");

  return (
    <HomeSection
      title="Дом"
      href="/rooms"
      linkLabel="Помещения"
      className={`home-plan-card ${className}`}
      aside={
        <span className="home-section-meta" aria-label={unitName}>
          <span>{devicesLabel(deviceCount)}</span>
          {temperatureC !== null ? (
            <MetricChip compact icon={temp.icon} color={temp.color} value={formatTemperature(temperatureC)} />
          ) : null}
          {humidityPercent !== null ? (
            <MetricChip compact icon={humidity.icon} color={humidity.color} value={formatHumidity(humidityPercent)} />
          ) : null}
        </span>
      }
    >
      {plans.length ? (
        <FloorPlan floors={plans} canCommand={canCommand} cameras={cameras} switcher />
      ) : (
        <p className="text-[15px] text-muted">Планировка для этого дома ещё не загружена.</p>
      )}
    </HomeSection>
  );
}

export function HomeRooms({ rooms, metrics }: { rooms: Room[]; metrics?: MetricStyle[] }) {
  if (!rooms.length) return null;
  const temp = metricLook(metrics, "temperature");

  return (
    <HomeSection title="Помещения" href="/rooms" className="home-rooms">
      <div className={`room-row ${rooms.length <= 5 ? "room-row-fit" : ""}`}>
        {rooms.map((room) => (
          <Link key={(room.id ?? "") + room.name} href={room.id ? `/rooms/${room.id}` : "/rooms"} className="room-tile">
            <span className="tile-icon">
              <Icon name="house" className="h-[18px] w-[18px]" />
            </span>
            <span className="room-text">
              <span className="room-name">{room.name}</span>
              <span className="room-sub">
                {devicesLabel(room.deviceCount ?? 0)}
                {room.temperatureC !== null && room.temperatureC !== undefined ? (
                  <span style={{ color: temp.color }}> · {formatTemperature(room.temperatureC)}</span>
                ) : null}
              </span>
            </span>
            <Icon name="chevron" className="room-chevron" />
          </Link>
        ))}
      </div>
    </HomeSection>
  );
}
