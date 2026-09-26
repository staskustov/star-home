import { Icon, type IconName } from "@/components/icons";
import type { QuickAction } from "@/types/domain";

const icons: Record<string, IconName> = {
  "open-gate": "gate",
  guests: "guests",
  security: "security",
  pay: "payments",
  "lights-off": "devices",
  "curtains-close": "rooms",
  night: "settings",
};

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
        <button key={action.id} type="button" onClick={() => onSelect(action.id)} className="tile">
          <span className="tile-icon">
            <Icon name={icons[action.id] ?? "service"} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 leading-[1.2]">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
