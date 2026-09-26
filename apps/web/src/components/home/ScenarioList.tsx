"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commandMessage, runCommand } from "@/lib/command";

type Scenario = {
  id: string;
  name: string;
  trigger: string;
  lifeMode: string | null;
  enabled?: boolean;
  scheduleHour?: number | null;
  scheduleMinute?: number | null;
  conditions?: { deviceId: string; field: string; value?: unknown }[];
  steps: { deviceId: string; command: string; value?: unknown }[];
};
type Device = { id?: string; name: string };

export function ScenarioList({ scenarios, devices }: { scenarios: Scenario[]; devices: Device[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState(devices.find((item) => item.id)?.id ?? "");
  const [command, setCommand] = useState("setPower");
  const [trigger, setTrigger] = useState("MANUAL");
  const [hour, setHour] = useState("22");
  const [minute, setMinute] = useState("0");
  const [field, setField] = useState("on");

  async function run(scenarioId: string) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/scenarios/${scenarioId}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    );
    setNotice(result.payload?.needsConfirm ? "Подтвердите опасный шаг в карточке устройства." : commandMessage(result.payload));
    if (result.ok && result.payload?.confirmed) router.refresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    const body: Record<string, unknown> = {
      name,
      trigger,
      steps: [{ deviceId, command, value: command === "setPower" ? false : 0 }],
    };
    if (trigger === "SCHEDULE") {
      body.scheduleHour = Number(hour);
      body.scheduleMinute = Number(minute);
    }
    if (trigger === "EVENT") {
      body.conditions = [{ deviceId, field, value: field === "on" ? false : field === "detected" ? true : "CLOSED" }];
    }
    const result = await runCommand(() =>
      fetch("/api/smart-home/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    );
    setNotice(result.ok ? "Сценарий сохранён." : commandMessage(result.payload));
    if (result.ok) {
      setName("");
      router.refresh();
    }
  }

  async function toggle(scenario: Scenario) {
    setNotice(null);
    const result = await runCommand(() =>
      fetch(`/api/smart-home/scenarios/${scenario.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: scenario.enabled === false }),
      }),
    );
    setNotice(result.ok ? "Сохранено." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  async function remove(scenarioId: string) {
    setNotice(null);
    const result = await runCommand(() => fetch(`/api/smart-home/scenarios/${scenarioId}`, { method: "DELETE" }));
    setNotice(result.ok ? "Сценарий удалён." : commandMessage(result.payload));
    if (result.ok) router.refresh();
  }

  return (
    <div className="mt-7 space-y-4">
      <ul className="panel overflow-hidden">
        {scenarios.length === 0 ? <li className="list-row text-[15px] text-muted">Сценариев нет.</li> : null}
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="list-row">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] text-ink">{scenario.name}</span>
              <span className="mt-0.5 block text-[13px] text-muted">
                {label(scenario)}
                {scenario.enabled === false ? " · выкл" : ""}
                · шагов {scenario.steps.length}
              </span>
            </span>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void run(scenario.id)}>
              Запустить
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void toggle(scenario)}>
              {scenario.enabled === false ? "Вкл" : "Выкл"}
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => void remove(scenario.id)}>
              Удалить
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="panel space-y-3 px-5 py-5">
        <p className="text-[16px] text-ink">Новый сценарий</p>
        <input value={name} onChange={(event) => setName(event.target.value)} className="control" placeholder="Название" />
        <select value={trigger} onChange={(event) => setTrigger(event.target.value)} className="control">
          <option value="MANUAL">Вручную</option>
          <option value="EVENT">По событию</option>
          <option value="SCHEDULE">По времени</option>
        </select>
        <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="control">
          {devices.filter((device) => device.id).map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
        <select value={command} onChange={(event) => setCommand(event.target.value)} className="control">
          <option value="setPower">Питание</option>
          <option value="setPosition">Положение</option>
          <option value="close">Закрыть</option>
        </select>
        {trigger === "SCHEDULE" ? (
          <div className="grid grid-cols-2 gap-3">
            <input value={hour} onChange={(event) => setHour(event.target.value)} className="control" placeholder="Час" />
            <input value={minute} onChange={(event) => setMinute(event.target.value)} className="control" placeholder="Минута" />
          </div>
        ) : null}
        {trigger === "EVENT" ? (
          <select value={field} onChange={(event) => setField(event.target.value)} className="control">
            <option value="on">Питание выкл</option>
            <option value="detected">Датчик сработал</option>
            <option value="latch">Замок закрыт</option>
          </select>
        ) : null}
        <button type="submit" className="btn btn-primary btn-compact">
          Сохранить
        </button>
      </form>
      {notice ? (
        <p role="status" className="text-[15px] text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function label(scenario: Scenario): string {
  if (scenario.trigger === "LIFE_MODE") return `Режим ${scenario.lifeMode}`;
  if (scenario.trigger === "SCHEDULE") {
    const hour = scenario.scheduleHour ?? 0;
    const minute = String(scenario.scheduleMinute ?? 0).padStart(2, "0");
    return `В ${hour}:${minute}`;
  }
  if (scenario.trigger === "EVENT") return "По событию";
  return "Вручную";
}
