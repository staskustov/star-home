"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AIBar } from "@/components/home/AIBar";
import { HomeStatus } from "@/components/home/HomeStatus";
import { LifeModeSwitcher } from "@/components/home/LifeModeSwitcher";
import { PaymentCard } from "@/components/home/PaymentCard";
import { QuickActions } from "@/components/home/QuickActions";
import { SecurityStatus } from "@/components/home/SecurityStatus";
import { VisitorCard } from "@/components/home/VisitorCard";
import { Header } from "@/components/shell/Header";
import { greetingForHour } from "@/lib/greeting";
import type { LifeMode, ResidentHome } from "@/types/domain";

const unconfirmed = "Не удалось подтвердить выполнение.";

export function ResidentHomeScreen({ data }: { data: ResidentHome }) {
  const router = useRouter();
  const [mode, setMode] = useState<LifeMode>(data.activeLifeMode);
  const [notice, setNotice] = useState<string | null>(null);
  const current = data.lifeModes.find((item) => item.mode === mode) ?? data.lifeModes[0];
  const greeting = greetingForHour(new Date().getHours(), data.residentName);

  async function changeMode(next: LifeMode) {
    const previous = mode;
    setMode(next);
    setNotice(null);
    const response = await fetch("/api/life-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    if (!response.ok) {
      setMode(previous);
      setNotice("Не удалось сохранить режим.");
      return;
    }
    router.refresh();
  }

  function onAction(id: string) {
    if (id === "guests") {
      router.push("/access");
      return;
    }
    setNotice(unconfirmed);
  }

  if (!current) return null;

  return (
    <div className="space-y-8">
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
      <SecurityStatus label="Защита" state={current.securityLabel} tone={current.securityTone} />
      <section>
        <h2 className="mb-3 text-sm text-muted">Быстрые действия</h2>
        <QuickActions actions={data.quickActions} onSelect={onAction} />
        {notice ? (
          <p role="status" className="fade-in mt-3 text-sm text-muted">
            {notice}
          </p>
        ) : null}
      </section>
      <section>
        <h2 className="mb-3 text-sm text-muted">Сегодня</h2>
        {data.visitor || data.balance || data.todayEvent ? (
          <div className="space-y-3">
            {data.visitor ? <VisitorCard title={data.visitor.title} detail={data.visitor.detail} /> : null}
            {data.balance ? <PaymentCard title="Счёт" amount={data.balance.amount} currency={data.balance.currency} /> : null}
            {data.todayEvent ? (
              <article className="rounded-[20px] border border-line bg-surface px-5 py-4">
                <h3 className="text-[17px] text-ink">{data.todayEvent.title}</h3>
                <p className="mt-1 text-sm text-muted">{data.todayEvent.detail}</p>
              </article>
            ) : null}
          </div>
        ) : (
          <p className="text-[15px] text-muted">Пока тихо.</p>
        )}
      </section>
      <AIBar prompt={data.aiPrompt} />
    </div>
  );
}
