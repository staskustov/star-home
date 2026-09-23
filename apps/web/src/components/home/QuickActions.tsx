import type { QuickAction } from "@/types/domain";

export function QuickActions({
  actions,
  onSelect,
}: {
  actions: QuickAction[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action, index) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onSelect(action.id)}
          className={`btn ${index === 0 ? "btn-primary col-span-2" : "btn-secondary"}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
