import { residentHome } from "@/mocks/resident-home";

export default function ServicePage() {
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">Сервис</h1>
      <p className="mt-2 text-[15px] text-muted">Заявки по дому</p>
      <ul className="mt-8 divide-y divide-line rounded-[20px] border border-line bg-surface">
        {residentHome.serviceCategories.map((category) => (
          <li key={category} className="px-5 py-4 text-[16px] text-ink">
            {category}
          </li>
        ))}
      </ul>
    </section>
  );
}
