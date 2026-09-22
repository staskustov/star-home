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
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onSelect(action.id)}
          className="min-h-14 rounded-[16px] border border-line bg-surface px-3 text-center text-[15px] leading-tight text-ink transition-colors duration-200 hover:bg-surface-muted"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
