"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconSwatches } from "@/components/IconSwatches";
import { commandMessage, runCommand } from "@/lib/command";
import { deviceIconColorLabel } from "@/lib/google-icons";

export function IconColorPicker({ deviceId, color }: { deviceId: string; color?: string | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(color ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function choose(hex: string | null) {
    if (busy || hex === current) return;
    const previous = current;
    setCurrent(hex);
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${deviceId}/icon-color`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iconColor: hex }),
      }),
    );
    setBusy(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    setCurrent(previous);
    setNotice(commandMessage(result.payload));
  }

  return (
    <div className="mt-5">
      <p className="mb-2 text-[13px] text-muted">Цвет иконки · {deviceIconColorLabel(current)}</p>
      <IconSwatches color={current} onChange={(hex) => void choose(hex)} disabled={busy} />
      {notice ? <p className="mt-2 text-[13px] text-warning">{notice}</p> : null}
    </div>
  );
}
