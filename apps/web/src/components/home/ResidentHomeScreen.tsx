"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { GuestPassDialog } from "@/components/access/GuestPassDialog";
import { CameraBlock } from "@/components/home/CameraBlock";
import { HomeAccessBlock } from "@/components/home/HomeAccessBlock";
import { HomeActionStrip, type ActionChipTile } from "@/components/home/HomeActionStrip";
import { HomeChipStrip, type HomeChipTile } from "@/components/home/HomeChipStrip";
import { HomeHero } from "@/components/home/HomeHero";
import { WeatherStrip } from "@/components/home/WeatherStrip";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { StatusToast } from "@/components/ui/StatusToast";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import { greetingForHour } from "@/lib/greeting";
import type { LifeMode, ResidentHome } from "@/types/domain";

const SecuritySheet = dynamic(() => import("@/components/home/SecuritySheet").then((mod) => ({ default: mod.SecuritySheet })));

function visibleActionChips(data: ResidentHome): ActionChipTile[] {
  const fromLayout = (data.actionChips ?? []).filter((chip) => chip.action !== "open-gate");
  if (fromLayout.length) return fromLayout;
  const icons: Record<string, ActionChipTile["icon"]> = { guests: "guests", security: "security", pay: "payments" };
  return (data.quickActions ?? [])
    .filter((item) => item.id !== "open-gate" && (data.canPay || item.id !== "pay"))
    .map((item) => ({
      id: item.id,
      name: item.label,
      icon: icons[item.id] ?? "settings",
      kind: "ACTION",
      action: item.id,
    }));
}

export function ResidentHomeScreen({ data }: { data: ResidentHome }) {
  const router = useRouter();
  const [mode, setMode] = useState<LifeMode>(data.activeLifeMode);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [actionChips, setActionChips] = useState(() => visibleActionChips(data));

  useEffect(() => {
    setActionChips(visibleActionChips(data));
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
      <header>
        <h1 suppressHydrationWarning className="text-[28px] leading-[1.1] tracking-[-0.035em] text-ink sm:text-[34px]">
          {greeting}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          {data.object.name} · {data.unit.name}
        </p>
      </header>

      <WeatherStrip weather={data.weather} />
      <SecuritySheet open={securityOpen} onClose={() => setSecurityOpen(false)} />
      <GuestPassDialog open={guestOpen} onClose={() => setGuestOpen(false)} canCreate={data.canPass !== false} />
      <HomeChipStrip chips={data.scenarioChips ?? []} label="Сценарии" activeMode={current.mode} onSelect={onChip} />

      {data.controller?.message ? (
        <p className="panel px-5 py-4 text-[15px] text-warning">{data.controller.message}</p>
      ) : null}

      <CameraBlock cameras={data.cameras} />
      <HomeAccessBlock points={data.accessPoints ?? []} canCommand={data.canGate !== false} />
      <HomeActionStrip chips={actionChips} onSelect={onChip} />

      <HomeHero
        unitName={data.unit.name}
        rooms={data.rooms}
        temperatureC={data.climate?.temperatureC ?? null}
        humidityPercent={data.climate?.humidityPercent ?? null}
      />

      {notice ? (
        <p role="status" className="fade-in text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
      <StatusToast text={toast?.text ?? null} stamp={toast?.at} />
    </div>
  );
}
