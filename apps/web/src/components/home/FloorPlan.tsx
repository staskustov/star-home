import Link from "next/link";

export function FloorPlan({
  floors,
}: {
  floors: { floor: number; image: string; pins: { deviceId: string; name: string; x: number; y: number }[] }[];
}) {
  if (!floors.length) {
    return <p className="panel mt-4 px-5 py-5 text-[15px] text-muted">Планировка для этого дома ещё не загружена.</p>;
  }
  return (
    <div className="mt-4 space-y-4">
      {floors.map((plan) => (
        <figure key={plan.floor} className="panel overflow-hidden">
          <figcaption className="px-5 py-3 text-[15px] text-ink">{plan.floor} этаж</figcaption>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plan.image} alt={`План ${plan.floor} этажа`} className="block w-full" />
            {plan.pins.map((pin) => (
              <Link
                key={pin.deviceId}
                href={`/devices/${pin.deviceId}`}
                title={pin.name}
                className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              >
                <span className="sr-only">{pin.name}</span>
              </Link>
            ))}
          </div>
        </figure>
      ))}
    </div>
  );
}
