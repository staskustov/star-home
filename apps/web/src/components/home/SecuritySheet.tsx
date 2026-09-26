"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { commandMessage, runCommand } from "@/lib/command";

type Message = { id: string; actorName: string; body: string; at: string; mine: boolean };
type Desk = {
  objectName: string;
  placeName: string;
  phone: string | null;
  canCall: boolean;
  canChat: boolean;
  canSos: boolean;
  messages: Message[];
};

export function SecuritySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState(false);
  const hold = useRef<number>(0);
  const started = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/security/desk");
    const payload = (await response.json().catch(() => null)) as Desk | { message?: string } | null;
    if (response.ok && payload && "messages" in payload) setDesk(payload);
  }

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    setSent(false);
    setProgress(0);
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [desk?.messages.length]);

  function stopHold() {
    window.clearInterval(hold.current);
    setHolding(false);
    setProgress(0);
    started.current = 0;
  }

  function startHold() {
    if (!desk?.canSos || sent) return;
    started.current = Date.now();
    setHolding(true);
    hold.current = window.setInterval(() => {
      const next = Math.min(1, (Date.now() - started.current) / 3000);
      setProgress(next);
      if (next < 1) return;
      stopHold();
      void fireSos();
    }, 50);
  }

  async function fireSos() {
    setSent(true);
    const result = await runCommand(() => fetch("/api/security/sos", { method: "POST" }));
    setNotice(result.ok ? "Сигнал передан на пост охраны." : commandMessage(result.payload));
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || !desk?.canChat) return;
    const result = await runCommand(() =>
      fetch("/api/security/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload));
      return;
    }
    setText("");
    void load();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-sheet-title"
        className="panel fade-in flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 id="security-sheet-title" className="text-[24px] tracking-[-0.03em] text-ink">
              Охрана
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {desk ? `${desk.objectName} · ${desk.placeName}` : "Загрузка"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {desk?.canCall && desk.phone ? (
              <a href={`tel:${desk.phone}`} aria-label="Позвонить охране" className="btn btn-secondary btn-icon">
                <Icon name="phone" />
              </a>
            ) : (
              <span className="btn btn-secondary btn-icon opacity-40" aria-label="Номер охраны не задан" title="Администратор ещё не добавил номер охраны">
                <Icon name="phone" />
              </span>
            )}
            <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon">
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div ref={list} className="mt-4 min-h-[180px] flex-1 space-y-2 overflow-y-auto px-5">
          {desk && !desk.canChat ? <p className="text-[15px] text-muted">Гостю чат с охраной недоступен.</p> : null}
          {desk?.canChat && desk.messages.length === 0 ? <p className="text-[15px] text-muted">Напишите охране — ответ появится здесь.</p> : null}
          {desk?.messages.map((message) => (
            <div key={message.id} className={`max-w-[90%] rounded-2xl px-3 py-2 ${message.mine ? "ml-auto bg-accent/15" : "bg-surface-muted/50"}`}>
              <p className="text-[12px] text-muted">{message.mine ? "Вы" : message.actorName}</p>
              <p className="text-[15px] text-ink">{message.body}</p>
              <p className="mt-1 text-[11px] text-muted">{message.at}</p>
            </div>
          ))}
        </div>

        {desk?.canChat ? (
          <form onSubmit={(event) => void send(event)} className="mt-3 flex gap-2 px-5">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="control flex-1"
              placeholder="Сообщение охране"
              maxLength={400}
            />
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              Отправить
            </button>
          </form>
        ) : null}

        <div className="px-5 pb-5 pt-4">
          {desk?.canSos ? (
            <button
              type="button"
              className={`btn btn-danger btn-block select-none ${holding ? "opacity-90" : ""}`}
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={(event) => event.preventDefault()}
              disabled={sent}
            >
              {sent ? "SOS отправлен" : holding ? `Держите… ${Math.round(progress * 100)}%` : "SOS · держите 3 секунды"}
            </button>
          ) : null}
          {notice ? (
            <p role="status" className="mt-3 text-[14px] text-muted">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
