import { Icon, lifeModeIcon } from "@/components/icons";
import type { LifeMode, LifeModeSetting } from "@/types/domain";

export function LifeModeSwitcher({
  modes,
  value,
  onChange,
}: {
  modes: LifeModeSetting[];
  value: LifeMode;
  onChange: (mode: LifeMode) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Режим жизни" className="segment">
      {modes.map((mode) => {
        const selected = mode.mode === value;
        return (
          <button
            key={mode.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode.mode)}
            className="segment-item"
          >
            <Icon name={lifeModeIcon[mode.mode]} className="h-5 w-5" />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
