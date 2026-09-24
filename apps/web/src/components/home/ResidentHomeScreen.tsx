"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StarMark } from "@/components/brand/StarMark";
import { CameraBlock } from "@/components/home/CameraBlock";
import { HomeHero } from "@/components/home/HomeHero";
import { LifeModeSwitcher } from "@/components/home/LifeModeSwitcher";
import { QuickActions } from "@/components/home/QuickActions";
import { Icon, type IconName } from "@/components/icons";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { formatMoney } from "@/lib/format";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import { greetingForHour } from "@/lib/greeting";
import { houseReadout } from "@/lib/house-status";
import type { LifeMode, ResidentHome } from "@/types/domain";

type TodayRow = { key: string; icon: IconName; title: string; detail: string; href?: string };

export function ResidentHomeScreen({ data }: { data: ResidentHome }) {
  const router = useRouter();
  const [mode, setMode] = useState<LifeMode>(data.activeLifeMode);
  const [notice, setNotice] = useState<string | null>(null);
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

  async function onAction(id: string) {
    if (id === "guests") {
      router.push("/access");
      return;
    }
    const path = id === "open-gate" ? "/api/access/gate" : id === "security" ? "/api/security/call" : id === "pay" ? "/api/payments/pay" : "";
    if (!path) {
      setNotice(unconfirmed);
      return;
    }
    setNotice(null);
    const result = await runCommand(() => fetch(path, { method: "POST" }));
    setNotice(commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  if (!current) return null;
  const readout = houseReadout(data.devices, current);
  const security = readout.tone === "danger" ? "Есть проблема" : current.securityLabel;

  const today: TodayRow[] = [
    ...(data.visitor ? [{ key: "visitor", icon: "guests" as const, title: data.visitor.title, detail: data.visitor.detail, href: "/access" }] : []),
    ...(data.balance ? [{ key: "balance", icon: "payments" as const, title: "Счёт", detail: formatMoney(data.balance.amount, data.balance.currency) }] : []),
    ...(data.todayEvent ? [{ key: "event", icon: "event" as const, title: data.todayEvent.title, detail: data.todayEvent.detail }] : []),
    ...(data.todayRequest
      ? [{ key: "request", icon: "requests" as const, title: "Заявка", detail: `${data.todayRequest.title}. ${data.todayRequest.detail}`, href: "/service" }]
      : []),
    ...data.paymentHistory.map((payment) => ({
      key: `pay-${payment.title}-${payment.amount}`,
      icon: "payments" as const,
      title: "Оплачено",
      detail: `${payment.title} · ${formatMoney(payment.amount, payment.currency)}`,
    })),
    ...data.meters.map((meter) => ({ key: `meter-${meter.name}`, icon: "meter" as const, title: meter.name, detail: `${meter.value} ${meter.unit}` })),
  ];

  return (
    <div className="space-y-7">
      <LiveRefresh />
      <header>
        <div className="flex items-center justify-between lg:hidden">
          <p className="flex items-center gap-2 text-[12px] font-medium tracking-[0.26em] text-ink">
            <StarMark className="h-4 w-4 text-accent" />
            STAR HOME
          </p>
          <Link href="/profile" aria-label="Личный кабинет" className="avatar">
            {data.residentName.slice(0, 1) || "·"}
          </Link>
        </div>
        <h1 suppressHydrationWarning className="mt-6 text-[28px] leading-[1.1] tracking-[-0.035em] text-ink sm:text-[34px] lg:mt-0">
          {greeting}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          {data.object.name} · {data.unit.name}
        </p>
      </header>

      <LifeModeSwitcher modes={data.lifeModes} value={current.mode} onChange={changeMode} />

      <CameraBlock cameras={data.cameras} />

      <HomeHero
        unitName={data.unit.name}
        rooms={data.rooms}
        summary={readout.summary}
        detail={readout.detail}
        tone={readout.tone}
        security={security}
        temperatureC={data.climate?.temperatureC ?? null}
        humidityPercent={data.climate?.humidityPercent ?? null}
      />

      <div className="space-y-3">
        <QuickActions actions={data.quickActions} onSelect={onAction} />
        {notice ? (
          <p role="status" className="fade-in text-[15px] text-muted">
            {notice}
          </p>
        ) : null}
      </div>

      <section aria-label="Сегодня">
        <h2 className="mb-3 text-[19px] tracking-[-0.02em] text-ink">Сегодня</h2>
        {today.length > 0 ? (
          <ul className="panel overflow-hidden">
            {today.map((row) => (
              <li key={row.key} className="list-row">
                <TodayContent row={row} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel px-5 py-5 text-[15px] text-muted">Пока тихо.</p>
        )}
      </section>
    </div>
  );
}

function TodayContent({ row }: { row: TodayRow }) {
  const body = (
    <>
      <span className="tile-icon">
        <Icon name={row.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink">{row.title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{row.detail}</span>
      </span>
    </>
  );
  if (!row.href) return body;
  return (
    <Link href={row.href} className="-my-1 flex min-w-0 flex-1 items-center gap-[14px] py-1">
      {body}
      <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}
