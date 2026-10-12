"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessPointsList, type AccessPoint } from "@/components/access/AccessPointsList";
import { GuestPassForm } from "@/components/access/GuestPassForm";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { commandMessage, runCommand } from "@/lib/command";
import type { AccessEvent } from "@/types/domain";

type GuestPass = {
  id: string;
  guestName: string;
  detail: string;
  vehicle?: string;
  code?: string;
  qr?: string;
  status?: string;
  statusLabel?: string;
};

function RevokePass({ pass }: { pass: GuestPass }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function revoke() {
    if (!window.confirm(`Отозвать пропуск «${pass.guestName}»?`)) return;
    setBusy(true);
    setError(null);
    const result = await runCommand(() => fetch(`/api/access/passes/${encodeURIComponent(pass.id)}`, { method: "DELETE" }));
    setBusy(false);
    if (!result.ok) {
      setError(commandMessage(result.payload, "Не удалось отозвать пропуск"));
      return;
    }
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn btn-secondary mt-3" onClick={revoke} disabled={busy}>
        {busy ? "Отзываю…" : "Отозвать"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function AccessPanel({
  place,
  passes,
  events,
  points = [],
  canCreate = true,
}: {
  place: string;
  canCreate?: boolean;
  passes: GuestPass[];
  points?: AccessPoint[];
  events: AccessEvent[];
}) {
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Доступ</h1>
      <p className="mt-2 text-[15px] text-muted">{place}</p>
      {points.length > 0 ? (
        <div className="mt-8">
          <AccessPointsList points={points} />
        </div>
      ) : null}
      {canCreate ? (
        <div className="mt-8">
          <GuestPassForm />
        </div>
      ) : (
        <p className="mt-8 text-[15px] text-muted">Пропуск оформляет житель.</p>
      )}
      <ul className="mt-6 divide-y divide-line panel">
        {passes.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">Гостей нет.</li>
        ) : (
          passes.map((pass) => (
            <li key={pass.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[16px] text-ink">{pass.guestName}</p>
                {pass.statusLabel ? (
                  <StatusBadge tone={pass.status === "ACTIVE" ? "success" : pass.status === "PENDING" ? "warning" : "info"}>{pass.statusLabel}</StatusBadge>
                ) : null}
              </div>
              <p className="text-sm text-muted">{pass.detail}</p>
              {pass.vehicle ? <p className="text-sm text-muted">{pass.vehicle}</p> : null}
              {pass.code ? <p className="mt-2 text-[20px] tracking-[0.18em] text-ink">{pass.code}</p> : null}
              {pass.qr ? <div className="mt-3 w-32 bg-white" dangerouslySetInnerHTML={{ __html: pass.qr }} /> : null}
              {canCreate && (pass.status === "ACTIVE" || pass.status === "PENDING") ? <RevokePass pass={pass} /> : null}
            </li>
          ))
        )}
      </ul>
      <ul className="mt-6 divide-y divide-line panel">
        {events.length === 0 ? (
          <li className="px-5 py-4 text-[15px] text-muted">История пуста.</li>
        ) : (
          events.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[16px] text-ink">{item.title}</p>
                <p className="text-sm text-muted">{item.time}</p>
              </div>
              <StatusBadge tone={item.result === "SUCCESS" ? "success" : item.result === "UNCONFIRMED" ? "warning" : "danger"}>
                {item.result === "SUCCESS" ? "Разрешено" : item.result === "UNCONFIRMED" ? "Не подтверждено" : "Отказ"}
              </StatusBadge>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
