"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuestPassDialog } from "@/components/access/GuestPassDialog";
import { CameraBlock } from "@/components/home/CameraBlock";
import type { ActionChipTile } from "@/components/home/HomeActionStrip";
import { HomeChipStrip, type HomeChipTile } from "@/components/home/HomeChipStrip";
import { HomeCover } from "@/components/home/HomeCover";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeQuickGrid } from "@/components/home/HomeQuickGrid";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { StatusToast } from "@/components/ui/StatusToast";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import { greetingForHour } from "@/lib/greeting";
import type { LifeMode, ResidentHome } from "@/types/domain";

const SecuritySheet = dynamic(() => import("@/components/home/SecuritySheet").then((mod) => ({ default: mod.SecuritySheet })));

function visibleScenarioChips(data: ResidentHome): HomeChipTile[] {
  const fromLayout = data.scenarioChips ?? [];
  if (fromLayout.length) return fromLayout;
  const icons: Record<string, string> = { HOME: "house", WORK: "work", VACATION: "travel" };
  return [
    ...data.lifeModes.map((mode) => ({
      id: mode.mode,
      name: mode.label,
      icon: icons[mode.mode] ?? "house",
      kind: "LIFE_MODE" as const,
      lifeMode: mode.mode,
    })),
    { id: "night", name: "Ночь", icon: "night", kind: "ACTION", action: "night" },
  ];
}

function visibleActionChips(data: ResidentHome): ActionChipTile[] {
  const fromLayout = (data.actionChips ?? []).filter((chip) => chip.action !== "open-gate");
  if (fromLayout.length) return fromLayout;
  const icons: Record<string, ActionChipTile["icon"]> = { guests: "guests", security: "security", pay: "payments" };
  const mapped = (data.quickActions ?? [])
    .filter((item) => item.id !== "open-gate" && (data.canPay || item.id !== "pay"))
    .map((item) => ({
      id: item.id,
      name: item.label,
      icon: icons[item.id] ?? "settings",
      kind: "ACTION" as const,
      action: item.id,
    }));
  if (mapped.length) return mapped;
  return [
    { id: "security", name: "Охрана", icon: "security", kind: "ACTION", action: "security" },
    { id: "guests", name: "Гости", icon: "guests", kind: "ACTION", action: "guests" },
  ];
}

export function ResidentHomeScreen({ data }: { data: ResidentHome }) {
  const router = useRouter();
  const [mode, setMode] = useState<LifeMode>(data.activeLifeMode);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [actionChips, setActionChips] = useState(() => visibleActionChips(data));
  const [points, setPoints] = useState(data.accessPoints ?? []);

  useEffect(() => {
    setActionChips(visibleActionChips(data));
    setPoints(data.accessPoints ?? []);
  }, [data]);
  const current = data.lifeModes.find((item) => item.mode === mode) ?? data.lifeModes[0];
  const greeting = greetingForHour(new Date().getHours(), data.residentName);

  useEffect(() => {
    const snapshot = {
      place: `${data.object.name} · ${data.unit.name}`,
      mode: data.lifeModes.find((item) => item.mode === data.activeLifeMode)?.label ?? data.activeLifeMode,
      temperature: data.climate ? `${String(data.climate.temperatureC).replace(".", ",")}°` : "",
    };
    void caches.open("star-home-state").then((cache) => cache.put("/confirmed-home", new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } })));
  }, [data]);

  async function changeMode(next: LifeMode) {
    const previous = mode;
    setMode(next);
    setNotice(null);
    const result = await runCommand(() =>
      fetch("/api/life-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: next }),
      }),
    );
    if (!result.ok) {
      setMode(previous);
      setNotice(unconfirmed);
      return;
    }
    router.refresh();
  }

  async function onChip(chip: HomeChipTile | ActionChipTile) {
    if (chip.lifeMode) {
      await changeMode(chip.lifeMode);
      return;
    }
    if ("latch" in chip && chip.deviceId && (chip.action === "open-gate" || chip.action === "open-point" || chip.latch)) {
      const open = chip.latch !== "OPEN";
      setPoints((current) =>
        current.map((point) => (point.id === chip.deviceId ? { ...point, latch: open ? "OPEN" : "CLOSED", status: open ? "Открыто" : "Закрыто" } : point)),
      );
      setActionChips((current) => current.map((item) => (item.id === chip.id ? { ...item, latch: open ? "OPEN" : "CLOSED" } : item)));
      setNotice(null);
      setToast({ text: open ? "Открыто" : "Закрыто", at: Date.now() });
      const result = await runCommand(() =>
        fetch(open ? "/api/access/points" : `/api/access/points/${chip.deviceId}/close`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pointId: chip.deviceId }),
        }),
      );
      if (!result.ok || result.payload?.confirmed !== true) {
        setPoints(data.accessPoints ?? []);
        setActionChips((current) => current.map((item) => (item.id === chip.id ? { ...item, latch: chip.latch } : item)));
        setToast({ text: commandMessage(result.payload), at: Date.now() });
      }
      return;
    }
    if (chip.scenarioId) {
      setNotice(null);
      const result = await runCommand(() =>
        fetch(`/api/smart-home/scenarios/${chip.scenarioId}/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      setNotice(commandMessage(result.payload));
      return;
    }
    if (chip.action) await onAction(chip.action);
  }

  async function onAction(id: string) {
    if (id === "guests") {
      setGuestOpen(true);
      return;
    }
    if (id === "security") {
      setSecurityOpen(true);
      return;
    }
    if (id === "lights-off" || id === "curtains-close" || id === "night") {
      setNotice(null);
      const result = await runCommand(() =>
        fetch("/api/smart-home/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: id }),
        }),
      );
      const payload = result.payload;
      setNotice(payload?.needsConfirm ? "Подтвердите команду в карточке устройства." : commandMessage(payload));
      return;
    }
    const path = id === "open-gate" ? "/api/access/gate" : id === "pay" ? "/api/payments/pay" : "";
    if (!path) {
      setNotice(unconfirmed);
      return;
    }
    if (id === "open-gate") {
      setNotice(null);
      setToast({ text: "Открыто", at: Date.now() });
      const result = await runCommand(() => fetch(path, { method: "POST" }));
      if (!result.ok || result.payload?.confirmed !== true) {
        setToast({ text: commandMessage(result.payload), at: Date.now() });
      }
      return;
    }
    setNotice(null);
    const result = await runCommand(() => fetch(path, { method: "POST" }));
    setNotice(commandMessage(result.payload));
  }

  if (!current) return null;

  return (
    <div className="home-stack">
      <LiveRefresh />
      <HomeCover
        sky
        place={`${data.object.name} · ${data.unit.name}`}
        greeting={greeting}
        weather={data.weather}
        indoor={data.climate}
      />
      <div className="home-body">
        <HomeChipStrip chips={visibleScenarioChips(data)} label="Сценарии" activeMode={current.mode} onSelect={onChip} />

        {data.controller?.message ? (
          <p className="panel px-5 py-4 text-[15px] text-warning">{data.controller.message}</p>
        ) : null}

        <CameraBlock cameras={data.cameras} />
        <HomeQuickGrid
          points={points}
          chips={actionChips}
          guestCount={data.guestCount ?? 0}
          securityStatus={data.securityStatus ?? "Норма"}
          onSelect={onChip}
        />

        <HomeHero
          unitName={data.unit.name}
          rooms={data.rooms}
          temperatureC={data.climate?.temperatureC ?? null}
          humidityPercent={data.climate?.humidityPercent ?? null}
          metrics={data.weather?.metrics}
        />

        <Link href="/payments" className="panel flex items-center gap-3 px-4 py-3">
          <span className="tile-icon">
            <Icon name="payments" className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] text-ink">Коммунальные платежи</span>
            <span className="mt-0.5 block text-[13px] text-muted">{data.balance ? "Оплатите услуги поселка" : "Открытых счетов нет"}</span>
          </span>
          <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
        </Link>

        {notice ? (
          <p role="status" className="fade-in text-[15px] text-muted">
            {notice}
          </p>
        ) : null}
      </div>
      <SecuritySheet open={securityOpen} onClose={() => setSecurityOpen(false)} />
      <GuestPassDialog open={guestOpen} onClose={() => setGuestOpen(false)} canCreate={data.canPass !== false} />
      <StatusToast text={toast?.text ?? null} stamp={toast?.at} />
    </div>
  );
}
