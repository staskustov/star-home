# STAR HOME — Gateway Architecture

Статус: **Phase 0. Шлюз. Код не писался.**

Wiren Board — первый контроллер. Ядро STAR HOME от него не зависит.

## 1. Роли

```
Локальная автоматика (живёт без интернета)
  термостат, реле, сценарии контроллера, датчики, аварии

STAR HOME Local Gateway  (на объекте, LAN)
  нормализация, команды, heartbeat, очередь в Cloud

STAR HOME Cloud
  UX, RBAC, аудит, уведомления, AI, кэш состояния
```

Если интернет пропал: контроллер работает. Cloud показывает последнее известное состояние и `stale`.

## 2. Запрещённые схемы

```
Приложение ──интернет──► MQTT Wiren Board     ЗАПРЕЩЕНО
Приложение ──интернет──► IP / HTTP контроллера  ЗАПРЕЩЕНО в resident UI
Frontend ──► topic / register / device id      ЗАПРЕЩЕНО
```

Правильно:

```
App / Admin / AI
  → STAR HOME API (authz)
    → Secure Gateway Channel
      → Local Gateway
        → MQTT (только LAN)
          → Wiren Board
            → устройства
```

Cloud не открывает брокер контроллера наружу.

## 3. DeviceAdapter

Уже есть заготовка `DeviceAdapter.execute(device, command)` в `apps/web/src/server/devices.ts`.
Сейчас все не-local протоколы сведены к HTTP POST.

Целевое разделение:

```ts
interface GatewayAdapter {
  kind: "wirenboard" | "mqtt" | "modbus" | "matter" | "http" | "knx" | "onvif" | "local";
  connect(gateway: Gateway): Promise<void>;
  disconnect(): Promise<void>;
  syncDevices(): Promise<NormalizedDevice[]>;
  readState(externalId: string): Promise<NormalizedState>;
  command(externalId: string, command: string, value: unknown): Promise<{ confirmed: boolean }>;
  health(): Promise<{ status: "ONLINE" | "OFFLINE" | "DEGRADED" }>;
}
```

Cloud вызывает адаптер **только** у Local Gateway (или local/http stub в dev).
В Cloud остаются: реестр, права, проекция состояния.

Первый адаптер: `WirenBoardAdapter` (MQTT). Не импортировать его в UI и не писать `if (adapter === "wirenboard")` в resident-коде.

Дальше те же интерфейсы: MQTT, Modbus RTU/TCP, Matter, Zigbee (через шлюз), KNX, HTTP, ONVIF.

## 4. Канал Cloud ↔ Local Gateway

Направление: **исходящее с объекта** (шлюз сам держит сессию). Входящий MQTT/порты контроллера в интернет не публикуем.

Сейчас:

- Staff `devices.edit` выдаёт / меняет / отзывает токен. В снимке только `tokenHash`
- Heartbeat, inbound, pull, ack: `/api/smart-home/gateways/channel` + `x-star-home-gateway`
- Очередь `commandId`: повторный ack идемпотентен
- Агент: `apps/gateway/agent.ts` — не подтверждает то, что не применил

Ещё впереди:

- взаимный TLS
- полный Local Gateway binary

При reconnect:

1. reconnect
2. authenticate
3. sync devices
4. sync state
5. detect changes
6. publish current state
7. gateway healthy

Пока Local Gateway не написан (Phase 2), Cloud использует существующие `local` / `http` адаптеры. HTTP — только если endpoint задан админом; успех только при `confirmed` от адаптера. Протокол не подменяем.

## 5. Wiren Board (первый контур)

Предпочтительный канал: **MQTT брокера на LAN**, не прямое железо.

Gateway:

- подписывается на состояния
- принимает события
- публикует команды
- следит за связью
- синхронизирует и нормализует устройства
- отдаёт STAR HOME уже нормализованный вид

Cloud не парсит wb-specific topic в бизнес-логике. Маппинг topic ↔ capability живёт в `WirenBoardAdapter` на шлюзе.

Документ реализации адаптера (`SMART_HOME_WIREN_BOARD.md`) — в Phase 2, не сейчас.

## 6. Наблюдаемость

Для технического UI и логов API:

- gateway health, lastSeen
- device health
- command latency / success
- connection / sync / adapter errors

Жителю: «Контроллер недоступен», «Устройство недоступно». Без timeout и stack.

## 7. Что не делать в Cloud

- Хранить пароль брокера в frontend.
- Считать Cloud источником уставки термостата, если локальная автоматика её держит: Cloud шлёт команду, локальный контроллер — истина физического контура.
- Воскрешать удалённые seed-устройства (`removedDeviceIds` уже есть — сохранить поведение).
