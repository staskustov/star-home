"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { lifeModeChecks, type LifeModeCheck, type LifeModeSetting } from "@/types/domain";

export function LifeModeSettings({ objects }: { objects: { objectId: string; modes: LifeModeSetting[] }[] }) {
  const { selected } = useAdminPreview();
  const modes = objects.find((object) => object.objectId === selected?.id)?.modes;
  if (!selected || !modes) {
    return <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Настройки</h1>;
  }
  return <ModeEditor key={selected.id} objectId={selected.id} objectName={selected.name} modes={modes} />;
}

function ModeEditor({
  objectId,
  objectName,
  modes,
}: {
  objectId: string;
  objectName: string;
  modes: LifeModeSetting[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(modes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function patch(mode: LifeModeSetting["mode"], change: Partial<LifeModeSetting>) {
    setDrafts((current) => current.map((item) => (item.mode === mode ? { ...item, ...change } : item)));
  }

  function toggleCheck(mode: LifeModeSetting["mode"], check: LifeModeCheck) {
    setDrafts((current) =>
      current.map((item) => {
        if (item.mode !== mode) return item;
        const checks = item.checks.includes(check) ? item.checks.filter((id) => id !== check) : [...item.checks, check];
        return { ...item, checks };
      }),
    );
  }

  async function save(setting: LifeModeSetting) {
    setError(null);
    setSaved(null);
    const response = await fetch("/api/life-mode/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId, setting }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "Не удалось сохранить");
      return;
    }
    setSaved(setting.label);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[36px] leading-none tracking-[-0.04em] text-ink">Настройки</h1>
      <p className="mt-3 text-[15px] text-muted">{objectName}. Три режима жизни.</p>
      <div className="mt-8 space-y-4">
        {drafts.map((mode) => (
          <form
            key={mode.mode}
            onSubmit={(event) => {
              event.preventDefault();
              void save(mode);
            }}
            className="rounded-[20px] border border-line bg-surface p-5"
          >
            <h2 className="text-[20px] tracking-[-0.03em] text-ink">{mode.label}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Название" value={mode.label} onChange={(label) => patch(mode.mode, { label })} />
              <Field label="Статус" value={mode.summary} onChange={(summary) => patch(mode.mode, { summary })} />
              <Field label="Климат" value={mode.climate} onChange={(climate) => patch(mode.mode, { climate })} />
              <Field label="Свет" value={mode.lighting} onChange={(lighting) => patch(mode.mode, { lighting })} />
              <Field label="Охрана" value={mode.security} onChange={(security) => patch(mode.mode, { security })} />
              <Field
                label="Уведомления"
                value={mode.notifications}
                onChange={(notifications) => patch(mode.mode, { notifications })}
              />
            </div>
            <label className="mt-4 block">
              <span className="text-sm text-muted">Текст на экране дома</span>
              <textarea
                value={mode.detail}
                onChange={(event) => patch(mode.mode, { detail: event.target.value })}
                rows={2}
                className="mt-2 w-full rounded-[14px] border border-line bg-bg px-4 py-3 text-base text-ink outline-none focus:border-accent"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              {lifeModeChecks.map((check) => {
                const on = mode.checks.includes(check.id);
                return (
                  <button
                    key={check.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCheck(mode.mode, check.id)}
                    className={`h-10 rounded-full px-4 text-sm ${on ? "bg-accent text-accent-contrast" : "border border-line text-ink"}`}
                  >
                    {check.label}
                  </button>
                );
              })}
            </div>
            <button type="submit" className="mt-5 h-12 rounded-[14px] bg-accent px-5 text-[15px] text-accent-contrast">
              Сохранить
            </button>
          </form>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? <p className="mt-4 text-sm text-muted">Сохранено: {saved}.</p> : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-[52px] w-full rounded-[14px] border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
