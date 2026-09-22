import { PlaceList } from "@/components/home/PlaceList";
import { requirePlaces } from "@/server/access";

export default async function MyObjectsPage() {
  const { name, places } = await requirePlaces();
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Мои объекты</h1>
      <p className="mt-2 text-[15px] text-muted">{name}</p>
      <div className="mt-8">
        <PlaceList places={places} />
      </div>
    </section>
  );
}
