"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PlaceList({ places }: { places: { membershipId: string; title: string; meta: string }[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function choose(membershipId: string) {
    setPendingId(membershipId);
    const response = await fetch("/api/session/membership", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ membershipId }),
    });
    const body = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
    if (!response.ok || !body?.redirectTo) {
      setPendingId(null);
      return;
    }
    router.push(body.redirectTo);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {places.map((place) => (
        <button
          key={place.membershipId}
          type="button"
          onClick={() => choose(place.membershipId)}
          disabled={pendingId !== null}
          className="panel w-full px-5 py-5 text-left"
        >
          <span className="block text-[22px] tracking-[-0.03em] text-ink">{place.title}</span>
          <span className="mt-1 block text-sm text-muted">{place.meta}</span>
        </button>
      ))}
    </div>
  );
}
