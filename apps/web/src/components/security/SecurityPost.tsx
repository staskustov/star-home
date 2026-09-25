"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ObjectSwitcher } from "@/components/home/ObjectSwitcher";
import { CameraTile } from "@/components/security/CameraTile";
import { Clock } from "@/components/security/Clock";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { openCameraWindow } from "@/lib/camera-window";
import { commandMessage, runCommand } from "@/lib/command";
import type { PassCheck, SecurityAlarmStatus, SecurityPostView } from "@/types/security";

const alarmLabels: Record<SecurityAlarmStatus, string> = {
  OPEN: "Ждёт ответа",
  ACCEPTED: "Принята",
  CLOSED: "Закрыта",
};

function Panel({ title, meta, children, className = "" }: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 sm:p-6 ${className}`} aria-label={title}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] tracking-[-0.02em] text-ink">{title}</h2>
        {meta ? <div className="text-[13px] text-muted">{meta}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-[15px] text-muted">{children}</p>;
}

function Notice({ text, ok }: { text: string | null; ok: boolean }) {
  if (!text) return null;
  return (
    <p role="status" className={`mt-3 text-[14px] ${ok ? "text-success" : "text-danger"}`}>
      {text}
    </p>
  );
}

async function post(url: string, body: unknown) {
  return runCommand(() => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

function Alarms({ view, onDone }: { view: SecurityPostView; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const active = view.alarms.filter((alarm) => alarm.status !== "CLOSED");
  const closed = view.alarms.filter((alarm) => alarm.status === "CLOSED");

  async function act(id: string, step: "ACCEPT" | "CLOSE") {
    setBusy(id);
    setNotice(null);
    const result = await post(`/api/security/alarms/${encodeURIComponent(id)}`, { step });
    setBusy(null);
    setNotice({ text: result.ok ? (step === "ACCEPT" ? "Тревога принята." : "Тревога закрыта.") : commandMessage(result.payload), ok: result.ok });
    onDone();
  }

  return (
    <Panel
      title="Тревоги"
      meta={active.length > 0 ? <StatusBadge tone="danger">{`Активных: ${active.length}`}</StatusBadge> : <StatusBadge tone="success">Активных нет</StatusBadge>}
    >
      {active.length === 0 ? <Empty>Сейчас никто не вызывает охрану.</Empty> : null}
      <ul className="grid gap-3">
        {active.map((alarm) => (
          <li
            key={alarm.id}
            className={`rounded-2xl border p-4 ${alarm.status === "OPEN" ? "border-danger/50 bg-danger/10" : "border-line/60 bg-surface-muted/30"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] text-ink">{alarm.title}</p>
                <p className="mt-0.5 text-[14px] text-muted">
                  {alarm.place} · {alarm.at}
                </p>
                <p className={`mt-1 text-[13px] ${alarm.status === "OPEN" ? "text-danger" : "text-warning"}`}>
                  {alarmLabels[alarm.status]}
                  {alarm.handledBy ? ` · ${alarm.handledBy}, ${alarm.handledAt}` : ""}
                </p>
              </div>
              {view.can.handle ? (
                <div className="flex gap-2">
                  {alarm.status === "OPEN" ? (
                    <button type="button" disabled={busy === alarm.id} onClick={() => void act(alarm.id, "ACCEPT")} className="btn btn-primary btn-compact disabled:opacity-50">
                      Принять
                    </button>
                  ) : null}
                  <button type="button" disabled={busy === alarm.id} onClick={() => void act(alarm.id, "CLOSE")} className="btn btn-secondary btn-compact disabled:opacity-50">
                    Закрыть
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Notice text={notice?.text ?? null} ok={notice?.ok ?? true} />
      {closed.length > 0 ? (
        <div className="mt-4">
          <button type="button" aria-expanded={showClosed} onClick={() => setShowClosed((value) => !value)} className="text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink">
            {showClosed ? "Скрыть закрытые" : `Закрытые: ${closed.length}`}
          </button>
          {showClosed ? (
            <ul className="mt-3 divide-y divide-line/50">
              {closed.map((alarm) => (
                <li key={alarm.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-[14px]">
                  <span className="text-ink">
                    {alarm.title} · <span className="text-muted">{alarm.place}</span>
                  </span>
                  <span className="text-muted">
                    {alarm.at}
                    {alarm.handledBy ? ` · закрыл ${alarm.handledBy}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function Points({ view, onDone }: { view: SecurityPostView; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  async function open(id: string) {
    setBusy(id);
    setNotice(null);
    const result = await post("/api/security/points", { objectId: view.objectId, pointId: id });
    setBusy(null);
    const confirmed = result.ok && result.payload?.confirmed === true;
    setNotice({ text: commandMessage(result.payload), ok: confirmed });
    onDone();
  }

  return (
    <Panel title="Точки доступа">
      {view.points.length === 0 ? <Empty>Общих ворот и калиток не подключено.</Empty> : null}
      <ul className="grid gap-2">
        {view.points.map((point) => (
          <li key={point.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted/30 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] text-ink">{point.name}</p>
              <p className={`text-[13px] ${point.ready ? "text-muted" : "text-danger"}`}>
                {point.kind} · {point.state}
              </p>
            </div>
            {view.can.open ? (
              <button type="button" disabled={!point.ready || busy === point.id} onClick={() => void open(point.id)} className="btn btn-primary btn-compact disabled:opacity-50">
                {busy === point.id ? "Открываем…" : "Открыть"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <Notice text={notice?.text ?? null} ok={notice?.ok ?? true} />
    </Panel>
  );
}

function PassCheckForm({ view }: { view: SecurityPostView }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<PassCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFound(null);
    setError(null);
    const result = await post("/api/security/passes", { objectId: view.objectId, code });
    setBusy(false);
    if (result.ok && result.payload) setFound(result.payload as unknown as PassCheck);
    else setError(commandMessage(result.payload, "Пропуск не найден"));
  }

  return (
    <Panel title="Проверка пропуска">
      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Код пропуска</span>
          <input
            className="control uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Код с экрана гостя"
            autoComplete="off"
            maxLength={24}
          />
        </label>
        <button type="submit" disabled={busy || code.trim().length < 4} className="btn btn-secondary disabled:opacity-50">
          Проверить
        </button>
      </form>
      {found ? (
        <div role="status" className="mt-4 rounded-2xl border border-success/40 bg-success/10 p-4">
          <p className="text-[13px] text-success">Пропуск действует</p>
          <p className="mt-1 text-[17px] text-ink">{found.guestName}</p>
          <p className="text-[14px] text-muted">
            {found.place} · {found.detail}
            {found.vehicle ? ` · ${found.vehicle}` : ""}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[14px] text-danger">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

function Cameras({ view }: { view: SecurityPostView }) {
  const [blocked, setBlocked] = useState(false);
  return (
    <Panel
      title="Камеры"
      meta={
        view.cameras.length > 0 ? (
          <button type="button" onClick={() => setBlocked(!openCameraWindow(view.objectId))} className="btn btn-secondary btn-compact">
            Отдельное окно
          </button>
        ) : null
      }
    >
      <p className="-mt-2 mb-4 text-[13px] text-muted">Видеопоток не подключён, доступен запрос кадра. Отдельное окно можно перенести на другой монитор.</p>
      {blocked ? (
        <p role="alert" className="mb-4 text-[13px] text-danger">
          Браузер заблокировал окно. Разрешите всплывающие окна для этого сайта или откройте{" "}
          <a href={`/security/cameras?object=${encodeURIComponent(view.objectId)}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            камеры во вкладке
          </a>
          .
        </p>
      ) : null}
      {view.cameras.length === 0 ? <Empty>Камер нет.</Empty> : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.cameras.map((camera) => (
          <CameraTile key={camera.id} camera={camera} objectId={view.objectId} />
        ))}
      </ul>
    </Panel>
  );
}

function Guests({ view }: { view: SecurityPostView }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return view.passes;
    return view.passes.filter((pass) => `${pass.guestName} ${pass.place} ${pass.vehicle} ${pass.detail}`.toLowerCase().includes(needle));
  }, [query, view.passes]);

  return (
    <Panel title="Гости" meta={`${view.passes.length}`}>
      {view.passes.length > 4 ? (
        <label className="mb-3 block">
          <span className="sr-only">Поиск гостя</span>
          <input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, номер машины, дом" />
        </label>
      ) : null}
      {rows.length === 0 ? <Empty>{view.passes.length === 0 ? "Пропусков нет." : "Никого не нашли."}</Empty> : null}
      <ul className="divide-y divide-line/50">
        {rows.map((pass) => (
          <li key={pass.id} className="py-2.5">
            <p className="text-[15px] text-ink">
              {pass.guestName}
              {pass.vehicle ? <span className="text-muted"> · {pass.vehicle}</span> : null}
            </p>
            <p className="text-[13px] text-muted">
              {pass.place} · {pass.detail}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Timeline({ view }: { view: SecurityPostView }) {
  return (
    <Panel title="События доступа">
      {view.events.length === 0 ? <Empty>Событий пока нет.</Empty> : null}
      <ul className="divide-y divide-line/50">
        {view.events.map((event) => (
          <li key={event.id} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="text-[15px] text-ink">{event.title}</span>
            <span className={`shrink-0 text-[13px] tabular-nums ${event.result === "SUCCESS" ? "text-muted" : "text-danger"}`}>
              {event.time}
              {event.result === "SUCCESS" ? "" : " · не подтверждено"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Journal({ view }: { view: SecurityPostView }) {
  return (
    <Panel title="Журнал поста">
      {view.journal.length === 0 ? <Empty>Записей нет.</Empty> : null}
      <ul className="divide-y divide-line/50">
        {view.journal.map((entry) => (
          <li key={entry.id} className="py-2.5">
            <p className="text-[14px] text-ink">
              {entry.action} <span className="text-muted">· {entry.target}</span>
            </p>
            <p className={`text-[12px] ${entry.result === "SUCCESS" ? "text-muted" : "text-danger"}`}>
              {entry.time} · {entry.actor}
              {entry.result === "SUCCESS" ? "" : entry.result === "DENIED" ? " · отказано" : " · ошибка"}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function SecurityPost({ view }: { view: SecurityPostView }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/50 px-5 py-4 backdrop-blur-xl lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="kicker text-accent">STAR HOME</p>
            <p className="mt-1 text-[20px] leading-tight tracking-[-0.03em] text-ink">Пост охраны</p>
          </div>
          <Clock />
          <ObjectSwitcher objects={view.objects} value={view.objectId} onChange={(id) => router.push(`/security?object=${encodeURIComponent(id)}`)} />
          <div className="flex items-center gap-2">
            {view.can.console ? (
              <Link href="/admin" className="btn btn-secondary btn-compact">
                Консоль
              </Link>
            ) : null}
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-secondary btn-compact">
                Выйти
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="fade-in mx-auto grid max-w-[1440px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-10 lg:py-8">
        <div className="grid content-start gap-5">
          <Alarms view={view} onDone={refresh} />
          {view.can.camera ? <Cameras view={view} /> : null}
          {view.can.passes ? <Timeline view={view} /> : null}
        </div>
        <div className="grid content-start gap-5">
          <Points view={view} onDone={refresh} />
          {view.can.passes ? <PassCheckForm view={view} /> : null}
          {view.can.passes ? <Guests view={view} /> : null}
          {view.can.journal ? <Journal view={view} /> : null}
        </div>
      </main>
    </div>
  );
}
