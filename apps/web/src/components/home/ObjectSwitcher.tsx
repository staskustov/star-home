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
    return <p className="text-[15px] text-ink">{current.name}</p>;
  }

  return (
    <label className="block min-w-0">
      <span className="sr-only">Объект</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-[14px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-accent sm:w-auto"
      >
        {objects.map((object) => (
          <option key={object.id} value={object.id}>
            {object.name}
          </option>
        ))}
      </select>
    </label>
  );
}
