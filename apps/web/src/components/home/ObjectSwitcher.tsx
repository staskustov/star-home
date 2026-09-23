import { Select } from "@/components/ui/Select";

export function ObjectSwitcher({
  objects,
  value,
  onChange,
}: {
  objects: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const current = objects.find((object) => object.id === value) ?? objects[0];
  if (!current) return null;

  if (objects.length <= 1) {
    return <p className="text-[15px] font-medium tracking-[-0.02em] text-ink">{current.name}</p>;
  }

  return (
    <label className="block min-w-0">
      <span className="sr-only">Объект</span>
      <Select wrapClassName="w-full sm:w-[240px]" value={value} onChange={(event) => onChange(event.target.value)}>
        {objects.map((object) => (
          <option key={object.id} value={object.id}>
            {object.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
