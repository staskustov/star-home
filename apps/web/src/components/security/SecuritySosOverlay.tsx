"use client";

import { useEffect, useRef, useState } from "react";
import type { SecurityPostView } from "@/types/security";

function isSos(alarm: SecurityPostView["alarms"][number]): boolean {
  return alarm.kind === "SOS" || alarm.title.includes("SOS");
}

function beep(context: AudioContext) {
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.type = "square";
  tone.frequency.value = 880;
  gain.gain.value = 0.08;
  tone.connect(gain);
  gain.connect(context.destination);
  tone.start();
  tone.stop(context.currentTime + 0.18);
}

export function SecuritySosOverlay({
  view,
  onAccept,
  onClose,
}: {
  view: Pick<SecurityPostView, "alarms" | "objectName" | "can">;
  onAccept: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const alarms = view.alarms ?? [];
  const open = alarms.filter((alarm) => isSos(alarm) && alarm.status === "OPEN");
  const accepted = alarms.filter((alarm) => isSos(alarm) && alarm.status === "ACCEPTED");
  const shown = open.length ? open : accepted.slice(0, 1);
  const flashing = open.length > 0;
  const audio = useRef<AudioContext | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  useEffect(() => {
    if (!flashing) {
      void audio.current?.close();
      audio.current = null;
      return;
    }
    const context = new AudioContext();
    audio.current = context;
    const play = () => {
      if (context.state === "suspended") void context.resume();
      beep(context);
    };
    play();
    const timer = window.setInterval(play, 700);
    return () => {
      window.clearInterval(timer);
      void context.close();
      if (audio.current === context) audio.current = null;
    };
  }, [flashing]);

  useEffect(() => {
    setConfirmClose(null);
  }, [shown[0]?.id]);

  if (!shown.length) return null;
  const alarm = shown[0];
  const closing = confirmClose === alarm.id;

  return (
    <div className={`fixed inset-0 z-[80] flex items-center justify-center p-5 ${flashing ? "animate-pulse bg-danger/70" : "bg-ink/70"}`}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sos-title"
        className="panel w-full max-w-xl rounded-[28px] p-6 text-center"
      >
        <p className="kicker text-danger">ЧП</p>
        <h2 id="sos-title" className="mt-3 text-[32px] tracking-[-0.04em] text-ink">
          SOS
        </h2>
        <p className="mt-4 text-[20px] text-ink">{alarm.callerName || "Житель"}</p>
        <p className="mt-1 text-[17px] text-muted">
          {view.objectName} · {alarm.place}
        </p>
        <p className="mt-4 text-[14px] text-muted">{alarm.at}</p>
        {view.can.handle ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {alarm.status === "OPEN" ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmClose(null);
                  onAccept(alarm.id);
                }}
              >
                Принять вызов
              </button>
            ) : (
              <p className="self-center text-[14px] text-warning">Вызов принят</p>
            )}
            <button
              type="button"
              className={closing ? "btn btn-danger" : "btn btn-secondary"}
              onClick={() => {
                if (closing) {
                  onClose(alarm.id);
                  setConfirmClose(null);
                  return;
                }
                setConfirmClose(alarm.id);
              }}
            >
              {closing ? "Подтвердить закрытие" : "Закрыть SOS"}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-[14px] text-muted">Ожидает ответа поста охраны</p>
        )}
        {closing ? (
          <p role="status" className="mt-3 text-[13px] text-danger">
            Нажмите ещё раз, чтобы снять вызов.
          </p>
        ) : null}
      </div>
    </div>
  );
}
