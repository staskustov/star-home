"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AIBar } from "@/components/home/AIBar";
import { HomeStatus } from "@/components/home/HomeStatus";
import { LifeModeSwitcher } from "@/components/home/LifeModeSwitcher";
import { PaymentCard } from "@/components/home/PaymentCard";
import { QuickActions } from "@/components/home/QuickActions";
import { SecurityStatus } from "@/components/home/SecurityStatus";
import { VisitorCard } from "@/components/home/VisitorCard";
import { Header } from "@/components/shell/Header";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { LiveRefresh } from "@/components/pwa/LiveRefresh";
import { formatMoney } from "@/lib/format";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";
import { greetingForHour } from "@/lib/greeting";
import type { LifeMode, ResidentHome } from "@/types/domain";

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

  return (
    <div className="space-y-8">
      <LiveRefresh />
      <InstallPrompt />
      <Header mark="STAR HOME" title={greeting} meta={`${data.object.name} · ${data.unit.name}`} />
      <LifeModeSwitcher modes={data.lifeModes} value={current.mode} onChange={changeMode} />
      <HomeStatus
        unitName={data.unit.name}
        summary={current.summary}
        tone={current.securityTone}
        detail={current.detail}
        temperatureC={data.climate?.temperatureC ?? null}
        humidityPercent={data.climate?.humidityPercent ?? null}
      />
      {data.meters.length > 0 ? (
        <ul className="grid gap-3">
          {data.meters.map((meter) => (
            <li key={meter.name} className="panel px-5 py-4">
              <p className="text-sm text-muted">{meter.name}</p>
              <p className="mt-1 text-[22px] tracking-[-0.03em] text-ink">
                {meter.value} {meter.unit}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <SecurityStatus label="Безопасность" state={current.securityLabel} tone={current.securityTone} />
      {data.categories.length > 0 ? (
        <p className="text-sm text-muted">{data.categories.join(" · ")}</p>
      ) : null}
      <section>
        <h2 className="kicker mb-3 text-muted">Быстрые действия</h2>
        <QuickActions actions={data.quickActions} onSelect={onAction} />
        {notice ? (
          <p role="status" className="fade-in mt-3 text-sm text-muted">
            {notice}
          </p>
        ) : null}
      </section>
      <section>
        <h2 className="kicker mb-3 text-muted">Сегодня</h2>
        {data.visitor || data.balance || data.todayEvent || data.todayRequest || data.paymentHistory.length > 0 ? (
          <div className="space-y-3">
            {data.visitor ? <VisitorCard title={data.visitor.title} detail={data.visitor.detail} /> : null}
            {data.balance ? <PaymentCard title="Счёт" amount={data.balance.amount} currency={data.balance.currency} /> : null}
            {data.todayEvent ? (
              <article className="panel px-5 py-4">
                <h3 className="text-[17px] text-ink">{data.todayEvent.title}</h3>
                <p className="mt-1 text-sm text-muted">{data.todayEvent.detail}</p>
              </article>
            ) : null}
            {data.todayRequest ? (
              <article className="panel px-5 py-4">
                <h3 className="text-[17px] text-ink">Заявка</h3>
                <p className="mt-1 text-sm text-muted">
                  {data.todayRequest.title}. {data.todayRequest.detail}
                </p>
              </article>
            ) : null}
            {data.paymentHistory.map((payment) => (
              <article key={`${payment.title}-${payment.amount}`} className="panel px-5 py-4">
                <h3 className="text-[17px] text-ink">История</h3>
                <p className="mt-1 text-sm text-muted">
                  {payment.title} · {formatMoney(payment.amount, payment.currency)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-muted">Пока тихо.</p>
        )}
      </section>
      <AIBar prompt={data.aiPrompt} />
    </div>
  );
}
