# STAR HOME — P0 targeted analysis

Дата: 2026-09-29  
Режим: read-only по коду. Код в этом файле не изменялся.  
Исходная точка: `docs/STAR_HOME_FULL_PROJECT_AUDIT.md`.

Правило статусов: **SOFTWARE VERIFIED** / **SIMULATOR VERIFIED** / **PHYSICAL HARDWARE VERIFIED**. Физический Wiren Board, реле и ONVIF в этом анализе **не проверялись**.

---

## Решение: архитектура однозначна

Несовместимых вариантов исправления нет. Дальше реализуется один контур.

| Вопрос | Решение | Почему не развилка |
|--------|---------|--------------------|
| Ворота через `commandDeviceSmart` (HIGH confirm) или оставить `openPoint`? | Оставить access RBAC (`access.gate.open`, без второго HIGH confirm). После авторизации — тот же `dispatchPhysicalCommand`, что и smart-home. | Аудит и существующий тест «opens and closes a gate without a second confirm». HIGH на `/access` сломает жителя. |
| Удалять `LocalGatewayAdapter`? | Нет. Явный DEMO в non-production. В `NODE_ENV=production` без `STAR_HOME_ALLOW_DEMO=1` — запрет, audit, `confirmed: false`. | Тесты и dev-сид требуют локального подтверждения. |
| Echo MQTT = CONFIRMED? | TEST MQTT (`STAR_HOME_MQTT_CONFIRM=echo`, текущий default) — echo может закрыть протокол. REAL (`=state`) — echo = DELIVERED, CONFIRMED только по telemetry ingest. | Существующие gateway-тесты echo должны остаться зелёными. |
| Брокер только localhost? | Агент: localhost **или** RFC1918 / `.local`. Публичный интернет-брокер по-прежнему `broker-forbidden`. | Пилот WB сидит в LAN, не на loopback облака. Облако по-прежнему не MQTT-клиент. |

---

## A. Command path

### Точки входа

| Вход | Файл | RBAC | Очередь | Adapter |
|------|------|------|---------|---------|
| `openGate` / `openPoint` / `closePoint` | `rpc-handlers.ts` → `operations.ts` `openGateFor` / `openPointFor` | `access.gate.open` (`placeFromSession`) | **Нет** | `commandDevice` → `runDevice` → `executeOnAdapter` |
| `openObjectGate` / `openObjectPoint` | `operations.ts` staff | `access.gate.open` + `objectFor` | **Нет** | то же |
| `POST /api/access/gate`, `/api/access/points` | web routes | session access | **Нет** | то же |
| `commandDeviceSmart` | `smart-home.ts` | `devices.command`; HIGH + confirm token | **Да**, если gateway remote (`!cloudExecutesAdapter`) | local/http: `executeOnAdapter` |
| `POST /api/smart-home/devices/[id]/command` | route → RPC | то же | то же | то же |
| Engineering `pollDevice` | `engineering.ts` | engineering | Нет | `runDevice(..., "READ")` — опрос, не актуатор |
| Сценарии / AI `control_device` | `scenarios.ts` / `ai.ts` | session | через `commandDeviceSmart` | smart-home |
| Агент pull/ack | `gateway-channel.ts` | pairing token | читает `gatewayCommands` | агент `apply.ts` |

Command ID создаётся только в `enqueueGatewayCommand` (`newId("gcmd")`). Путь ворот **не создаёт** command ID.

Статус очереди: `PENDING | SENT | ACKED | FAILED | EXPIRED` (`ops-store.ts` `GatewayCommand`).  
API smart-home: `accepted | queued | confirmed | failed`. UI успеха: `payload.confirmed === true` (`DeviceCommand.tsx`).

Retry/timeout MQTT: `apps/gateway/apply.ts` `applyMqtt` (timeout default 4 с, retries 2). Cloud expire: `expireGatewayCommands` / `commandReplayMs` 15 мин.

Подтверждение remote: `ackGatewayCommand` пишет device state **только если** `confirmed === true`.  
Подтверждение local/openPoint: `operations.commandDevice` пишет `latch` если `result.confirmed`.

### Call graph (факт)

```
Житель openPoint
  rpc-handlers.openPoint
    operations.openPointFor          // access.gate.open
      operations.commandDevice
        devices.runDevice            // OPEN→open, CLOSE→close
          gateway-adapter.executeOnAdapter
            LocalGatewayAdapter.execute  // confirmed: true без железа
        write latch + events + OPEN_GATE audit
        return { confirmed }

Житель commandDeviceSmart (свет / HIGH ворота)
  smart-home.commandDeviceSmart
    RBAC devices.command [+ HIGH token]
    если gateway wirenboard/mqtt/...:
      enqueueGatewayCommand → return accepted, confirmed: false
    иначе:
      executeOnAdapter → apply state if confirmed
```

**Вывод A:** физические команды ворот обходят очередь. Smart-home remote — нет. Это и есть P0-разрыв единого lifecycle.

---

## B. Gateway path (целевой и фактический)

Целевой (после P0):

```
UI → RPC/API → RBAC → dispatchPhysicalCommand
  → enqueueGatewayCommand (remote)
  → POST /api/smart-home/gateways/channel pull
  → agent.applyOne → applyQueuedCommand
  → MQTT publish (Wiren Board topics)
  → WB / simulator
  → MQTT state
  → ingestGatewayState
  → confirm queued SENT → ACKED / CONFIRMED
  → UI
```

Факт сегодня:

| Шаг | Файл / функция |
|-----|----------------|
| Cloud enqueue | `smart-home.ts` `commandDeviceSmart`; `gateway-queue.ts` `enqueueGatewayCommand` |
| Pull | `gateway-channel.ts` `pullGateway` |
| Agent tick | `apps/gateway/agent.ts` `tick` |
| Apply | `apps/gateway/apply.ts` `applyQueuedCommand` / `applyMqtt` |
| MQTT session | `apps/gateway/mqtt-session.ts` `connectLocalMqtt` |
| Ack | `gateway-queue.ts` `ackGatewayCommand` |
| Telemetry | `gateway-channel.ts` `ingestGatewayState` |

Ворота **не входят** в эту цепочку.

Cloud не является MQTT-клиентом (**SOFTWARE VERIFIED**). `WirenBoardAdapter.execute` в облаке не публикует.

---

## C. Demo path — как «живой дом» попадает в UI

| Источник | Где | Как выглядит live |
|----------|-----|-------------------|
| `LocalGatewayAdapter.execute` | `gateway-adapter.ts` | `confirmed: true` для open/close/setPower без железа |
| `isDemoDevice` | `ops-store.ts` | `metadata.demo === true` **или** `adapter === "local"` без gateway |
| Сид устройств | `ops-store.ts` `seed()` | все актуаторы `adapter: "local"`, камеры `work: "ON"` |
| `staticOutdoorWeather` 12.4 °C | hydrate WEATHER + seed state | `homeSignals` / тест `weather.temperatureC === 12.4` |
| Climate readings 22.4 °C | `seed().readings` | `homeSignals.climate` |
| Камеры «На связи» | `homeSignals` cameras: `work !== OFF/FAULT` → «На связи» | `cameraMedia: []` |
| MQTT echo | `agent.ts` `STAR_HOME_GATEWAY_ECHO=1` / `STAR_HOME_DEMO=1` | `applyQueuedCommand` `ctx.echo` → confirmed без брокера |
| `isStale` local | `smart-home.ts` | local никогда не stale |

Production UI на embedded+сид **покажет** свет, погоду и камеры как живые. Это ложный success, не PHYSICAL HARDWARE VERIFIED.

---

## D. Gates

Почему обход очереди: `operations.commandDevice` вызывает `runDevice` напрямую. Нет ветки `cloudExecutesAdapter` / `enqueueGatewayCommand`.

Какой adapter: `adapterFor` → при сиде `local` → `LocalGatewayAdapter`. Если бы ворота повесили на wirenboard gateway, `executeOnAdapter` вернул бы `awaiting-gateway` **без постановки в очередь** — команда просто не выполняется и не queued.

Отдельный access API: да. `openGate` / `openPoint` / `closePoint` + HTTP `/api/access/*`. Это правильный UX/RBAC, не отдельный physical path.

Можно ли направить через стандартный lifecycle: **да**. После `access.gate.open` вызвать тот же dispatch, что smart-home: remote → queue; local demo (non-prod) → adapter; production local → запрет.

Не ломать: HIGH confirm на `commandDeviceSmart` для ворот из карточки устройства; тест close/openPoint `confirmed: true` на сидовом local; `DeviceCommand.tsx` для open/close ходит в `/api/access/points` (это нормально, если API честный).

Optimistic toast «Открыто» до ответа (`ResidentHomeScreen.tsx`, `AccessPointsList.tsx`) — ложный success в UI. Нужно убрать.

---

## Mapping статусов (без второй БД)

Существующая очередь достаточна. Логический слой поверх:

| Логика P0 | Где сейчас |
|-----------|------------|
| ACCEPTED | enqueue `PENDING`; API `accepted` |
| DELIVERED | ack `sent: true` → `SENT` |
| EXECUTING | агент между pull и ack (не хранить отдельно) |
| EXECUTED | TEST echo confirmed **или** SENT + protocol echo в REAL (не CONFIRMED) |
| CONFIRMED | `ACKED` + `confirmed: true` **или** ingest state match |
| FAILED | `FAILED` / adapter error |
| TIMEOUT | `EXPIRED` или ack `mqtt-timeout` |

Command и device state уже разделены на remote path (очередь не пишет state до confirm). Local path пишет latch сразу при fake confirm — это и чинится production guard + queue для remote.

Idempotency: `enqueueGatewayCommand` схлопывает PENDING по gateway+device+**command** без value — риск потерять OFF после ON. Исправить: ключ command+value. Агент: `command-once.ts` по command id.

Gateway vs device: heartbeat уже не поднимает device online. Device без свежего `lastSeen` → OFFLINE. Gateway stale 90 с → gateway OFFLINE. Добавить CONNECTING/ERROR в отображение (сейчас DEGRADED на reconnect).

---

## Что не трогаем в P0

Камеры: только ложный «online», не ONVIF/RTSP.  
AI, оплата, Prisma cutover, UI создания шлюза, LIFE_MODE на агенте, cloud cron — вне P0.

---

## Критерий готовности после реализации

Готовность = **READY FOR CONTROLLED PHYSICAL HARDWARE PILOT** (софт + simulator + runbook).  
Не утверждать: «Wiren Board работает», «реле переключается», «камера работает».
