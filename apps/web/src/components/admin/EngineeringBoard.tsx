"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminPreview } from "@/components/admin/AdminPreview";
import { DeviceAddWizard } from "@/components/admin/DeviceAddWizard";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select } from "@/components/ui/Select";
import { commandMessage, runCommand } from "@/lib/command";
import type { DeviceWork, EngineeringBoard as Board, EngineeringDevice, EngineeringSystem } from "@/types/engineering";

type Notice = { text: string; ok: boolean };
type Hub = { id: string; objectId: string; name: string; adapter: string; status: string };
type NameMode = { kind: "create" } | { kind: "rename"; id: string; name: string };

function SystemState({ system }: { system: EngineeringSystem }) {
  if (system.tone === "muted") return <span className="text-[15px] text-muted">{system.state}</span>;
  return <StatusBadge tone={system.tone}>{system.state}</StatusBadge>;
}

function DeviceRow({ device, objectId, board }: { device: EngineeringDevice; objectId: string; board: Board }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const url = `/api/engineering/devices/${encodeURIComponent(device.id)}`;

  async function poll() {
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId }) }));
    setBusy(false);
    setNotice({ text: commandMessage(result.payload), ok: result.ok && result.payload?.confirmed === true });
    router.refresh();
  }

  async function setWork(work: DeviceWork) {
    setBusy(true);
    setNotice(null);
    const result = await runCommand(() => fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId, work }) }));
    setBusy(false);
    if (!result.ok) setNotice({ text: commandMessage(result.payload, "Не удалось сохранить"), ok: false });
    router.refresh();
  }

  const workTone = device.work === "ON" ? "text-muted" : device.work === "FAULT" ? "text-danger" : "text-warning";

  return (
    <li className="py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[16px] text-ink">{device.name}</p>
          <p className="text-[13px] text-muted">
            {device.place} · {device.link}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[16px] tabular-nums text-ink">{device.reading ?? <span className="text-[14px] text-muted">нет показаний</span>}</p>
          {board.can.edit ? null : <p className={`text-[13px] ${workTone}`}>{device.workLabel}</p>}
        </div>
      </div>
      {board.can.edit || board.can.poll ? (
        <div className="mt-3 flex items-center gap-2">
          {board.can.edit ? (
            <Select
              aria-label={`Состояние: ${device.name}`}
              value={device.work}
              disabled={busy}
              onChange={(event) => void setWork(event.target.value as DeviceWork)}
              wrapClassName="min-w-0 flex-1"
              className={workTone}
            >
              {board.works.map((work) => (
                <option key={work.value} value={work.value}>
                  {work.label}
                </option>
              ))}
            </Select>
          ) : null}
          {board.can.poll ? (
            <button type="button" disabled={busy || device.work === "OFF"} onClick={() => void poll()} className="btn btn-secondary btn-compact disabled:opacity-50">
              Опросить
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className={`mt-2 text-[13px] ${notice.ok ? "text-success" : "text-danger"}`}>
          {notice.text}
        </p>
      ) : null}
    </li>
  );
}

function NameDialog({
  title,
  submitLabel,
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-name-title"
        className="panel fade-in w-full max-w-md rounded-t-[28px] p-6 sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="system-name-title" className="text-[24px] tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn btn-secondary btn-icon">
            <Icon name="close" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6">
          <label className="block">
            <span className="text-sm text-muted">Название</span>
            <input value={value} onChange={(event) => onChange(event.target.value)} className="control mt-2" autoFocus />
          </label>
          <button type="submit" className="mt-6 btn btn-primary btn-block">
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

export function EngineeringBoard({ board }: { board: Board }) {
  const { selected } = useAdminPreview();
  const router = useRouter();
  const current = board.objects.find((object) => object.objectId === selected?.id) ?? board.objects[0];
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [gateways, setGateways] = useState<Hub[]>([]);
  const [nameMode, setNameMode] = useState<NameMode | null>(null);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openAdd(systemId: string) {
    if (!current) return;
    setAddingTo(systemId);
    const result = await runCommand(() => fetch(`/api/smart-home/gateways?objectId=${current.objectId}`));
    const list = Array.isArray(result.payload?.gateways) ? (result.payload.gateways as Hub[]) : [];
    setGateways(list);
  }

  async function saveSystem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !nameMode) return;
    setError(null);
    const result =
      nameMode.kind === "create"
        ? await runCommand(() =>
            fetch("/api/engineering/systems", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ objectId: current.objectId, name }),
            }),
          )
        : await runCommand(() =>
            fetch(`/api/engineering/systems/${encodeURIComponent(nameMode.id)}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name }),
            }),
          );
    if (!result.ok) {
      setError(commandMessage(result.payload, "Не удалось сохранить систему."));
      return;
    }
    setNameMode(null);
    setName("");
    router.refresh();
  }

  async function removeSystem(systemId: string) {
    setError(null);
    const result = await runCommand(() => fetch(`/api/engineering/systems/${encodeURIComponent(systemId)}`, { method: "DELETE" }));
    if (!result.ok) {
      setError(commandMessage(result.payload, "Не удалось удалить систему."));
      return;
    }
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="kicker text-accent">Системы</p>
          <h1 className="mt-2 text-[36px] leading-none tracking-[-0.04em] text-ink">Инженерия</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">
            Инженерные системы {selected ? `объекта «${selected.name}»` : "объекта"}. Назовите систему и добавьте к ней устройства объекта.
          </p>
        </div>
        {board.can.create && current ? (
          <button
            type="button"
            className="btn btn-primary btn-icon"
            aria-label="Добавить систему"
            onClick={() => {
              setName("");
              setNameMode({ kind: "create" });
            }}
          >
            <Icon name="plus" />
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-[15px] text-danger">{error}</p> : null}

      {nameMode ? (
        <NameDialog
          title={nameMode.kind === "create" ? "Новая система" : "Название системы"}
          submitLabel={nameMode.kind === "create" ? "Добавить" : "Сохранить"}
          value={name}
          onChange={setName}
          onSubmit={(event) => void saveSystem(event)}
          onClose={() => setNameMode(null)}
        />
      ) : null}

      {addingTo && current ? (
        <DeviceAddWizard
          objectId={current.objectId}
          gateways={gateways}
          rooms={[]}
          units={[]}
          lockScope="object"
          engineeringSystemId={addingTo}
          asDialog
          onClose={() => {
            setAddingTo(null);
            router.refresh();
          }}
        />
      ) : null}

      {!current ? (
        <p className="panel mt-8 p-6 text-[15px] text-muted">Нет доступных объектов.</p>
      ) : current.systems.length === 0 ? (
        <p className="panel mt-8 p-6 text-[15px] text-muted">Пока нет систем. Добавьте отопление, воду, электричество или свою.</p>
      ) : (
        <>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {current.systems.map((system) => (
              <section key={system.id} className="panel p-5 sm:p-6" aria-label={system.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[19px] tracking-[-0.02em] text-ink">{system.name}</h2>
                    <div className="mt-2">
                      <SystemState system={system} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {board.can.edit ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        aria-label={`Изменить ${system.name}`}
                        onClick={() => {
                          setName(system.name);
                          setNameMode({ kind: "rename", id: system.id, name: system.name });
                        }}
                      >
                        <Icon name="edit" />
                      </button>
                    ) : null}
                    {board.can.createDevice ? (
                      <button type="button" className="btn btn-primary btn-icon" aria-label={`Добавить устройство в ${system.name}`} onClick={() => void openAdd(system.id)}>
                        <Icon name="plus" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {system.devices.length === 0 ? (
                  <p className="mt-3 text-[14px] text-muted">Устройства этой системы не подключены.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line/50">
                    {system.devices.map((device) => (
                      <DeviceRow key={device.id} device={device} objectId={current.objectId} board={board} />
                    ))}
                  </ul>
                )}
                {board.can.edit ? (
                  pendingDelete === system.id ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <p className="text-[13px] text-muted">Удалить систему? Устройства останутся на объекте.</p>
                      <button type="button" className="btn btn-primary btn-compact" onClick={() => void removeSystem(system.id)}>
                        Удалить
                      </button>
                      <button type="button" className="btn btn-secondary btn-compact" onClick={() => setPendingDelete(null)}>
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="mt-4 text-[13px] text-muted" onClick={() => setPendingDelete(system.id)}>
                      Удалить систему
                    </button>
                  )
                ) : null}
              </section>
            ))}
          </div>

          <section className="panel mt-5 p-5 sm:p-6" aria-label="Счётчики">
            <h2 className="text-[19px] tracking-[-0.02em] text-ink">Счётчики</h2>
            {current.meters.length === 0 ? <p className="mt-3 text-[14px] text-muted">Счётчики не подключены.</p> : null}
            <ul className="mt-2 divide-y divide-line/50">
              {current.meters.map((meter) => (
                <li key={meter.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <div>
                    <p className="text-[16px] text-ink">{meter.name}</p>
                    <p className="text-[13px] text-muted">{meter.place}</p>
                  </div>
                  <p className="text-right text-[16px] tabular-nums text-ink">
                    {meter.value === null ? (
                      <span className="text-muted">нет показаний</span>
                    ) : (
                      <>
                        {meter.value} {meter.unit}
                        {meter.at ? <span className="block text-[12px] text-muted">{meter.at}</span> : null}
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
