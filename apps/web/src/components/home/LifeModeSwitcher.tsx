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
    <div role="radiogroup" aria-label="Режим жизни" className="grid grid-cols-3 gap-2">
      {modes.map((mode) => {
        const selected = mode.mode === value;
        return (
          <button
            key={mode.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode.mode)}
            className={`flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-[18px] px-1 text-[13px] transition-colors duration-200 sm:text-[15px] ${
              selected ? "bg-accent text-accent-contrast" : "border border-line bg-surface text-ink"
            }`}
          >
            <Icon name={lifeModeIcon[mode.mode]} className="h-5 w-5" />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
