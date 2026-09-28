"use client";

import { useState } from "react";
import { unconfirmed } from "@/lib/command";
import { iosDevice, standaloneDisplay, subscribePush } from "@/lib/push-client";

export function PushButton() {
  const [notice, setNotice] = useState<string | null>(null);

  async function enable() {
    setNotice(null);
    try {
      if (iosDevice() && !standaloneDisplay()) {
        setNotice("На iPhone: Поделиться → На экран «Домой», откройте STAR HOME и нажмите ещё раз.");
        return;
      }
      const result = await subscribePush(true);
      if (result === "ok") setNotice("Телефон сможет получать важные события.");
      else if (result === "denied") setNotice("Разрешите уведомления в настройках телефона.");
      else if (result === "missing") setNotice("Сохраните STAR HOME на экран Домой — тогда придут уведомления.");
      else setNotice(unconfirmed);
    } catch {
      setNotice(unconfirmed);
    }
  }

  return (
    <div className="mt-8">
      <button type="button" className="btn btn-secondary" onClick={enable}>
        Уведомления на телефон
      </button>
      {notice ? <p className="mt-3 text-sm text-muted">{notice}</p> : null}
    </div>
  );
}
