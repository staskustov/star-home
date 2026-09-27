"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand, unconfirmed } from "@/lib/command";

function toIso(local: string) {
  if (!local) return "";
  const date = new Date(local);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function GuestPassForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const fromIso = toIso(from);
    const toIsoValue = toIso(to);
    const result = await runCommand(() =>
      fetch("/api/access/passes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestName, vehicle, from: fromIso, to: toIsoValue, detail: from && to ? `${from.replace("T", " ")} — ${to.replace("T", " ")}` : "" }),
      }),
    );
    if (!result.ok) {
      setNotice(commandMessage(result.payload, unconfirmed));
      return;
    }
    setGuestName("");
    setVehicle("");
    setFrom("");
    setTo("");
    setNotice("Пропуск сохранён.");
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={add} className={compact ? "space-y-3" : "space-y-3 panel p-5"}>
      <label className="block">
        <span className="text-sm text-muted">Гость</span>
        <input value={guestName} onChange={(event) => setGuestName(event.target.value)} className="control mt-2" />
      </label>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="text-sm text-muted">Срок доступа</legend>
        <label className="block">
          <span className="text-[13px] text-muted">От</span>
          <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} className="control mt-2" required />
        </label>
        <label className="block">
          <span className="text-[13px] text-muted">До</span>
          <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} className="control mt-2" required />
        </label>
      </fieldset>
      <label className="block">
        <span className="text-sm text-muted">Автомобиль</span>
        <input value={vehicle} onChange={(event) => setVehicle(event.target.value)} className="control mt-2" />
      </label>
      <button type="submit" className="btn btn-primary">
        Оформить пропуск
      </button>
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
    </form>
  );
}
