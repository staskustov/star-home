"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand } from "@/lib/command";

export function FavoriteButton({ deviceId, favorite }: { deviceId: string; favorite?: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle() {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/devices/${deviceId}/favorite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: !favorite }),
      }),
    );
    setNotice(result.ok ? (favorite ? "Убрано с главной." : "Закреплено на главной.") : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  return (
    <div className="mt-4">
      <button type="button" className="btn btn-secondary btn-compact" onClick={() => void toggle()}>
        {favorite ? "Убрать с главной" : "На главную"}
      </button>
      {notice ? <p className="mt-2 text-[13px] text-muted">{notice}</p> : null}
    </div>
  );
}
