import { HomeCover } from "@/components/home/HomeCover";

export function HomeCoverEditor(_props: { objectId: string; photo: string; canEdit: boolean }) {
  return (
    <section className="mt-12">
      <h2 className="text-[24px] tracking-[-0.03em] text-ink">Небо на главной</h2>
      <p className="mt-2 text-[15px] text-muted">У всех жителей одно небо: в дневной теме голубое, в ночной — звёздное.</p>
      <div className="mt-5 overflow-hidden rounded-[28px]">
        <HomeCover sky place="Объект" greeting="Так видит житель" compact />
      </div>
    </section>
  );
}
