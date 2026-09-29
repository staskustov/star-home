# STAR HOME — аудит текущего состояния (этап 0)

Дата: 2026-09-28  
Объект аудита: репозиторий `/Users/staskustov/star-home`, ветка `cursor/star-mark-icon-and-http-session`  
Режим: **только чтение кода и документации. Архитектура не переписывалась.**

КП «Сияние» — первый объект данных, не отдельная ветка продукта. Бренд платформы — STAR HOME.

Оценка готовности к пилоту с **реальным** оборудованием: **нет**. Готовность каркаса (модель, права, UI, канал шлюза): **частичная**.

| Контур | Оценка | Комментарий |
|--------|--------|-------------|
| Облако / PWA / RBAC | 70% | Живой продукт, права на сервере |
| Модель устройств и каналов | 65% | Есть в `ops`, не в Prisma |
| Админ: реестр и визард | 55% | UI есть, железо не подтверждается |
| Канал локального шлюза | 45% | HTTP pull/ack есть, MQTT нет |
| Реальные команды | 20% | UI честный; агент не применяет; `local` подтверждает без железа |
| Телеметрия с контроллера | 25% | Ingest API есть; источник — JSON-файл, не брокер |
| Автоматизация | 55% | Облако + runtime на агенте; железо не подтверждено |
| Камеры | 55% | JPEG-кадр через агент; live HLS нет; железо не подтверждено |
| Локальный runtime без интернета | 50% | Софт: EVENT/SCHEDULE/critical на агенте; объект не проверен |
| Пилот на объекте | 15% | Нет E2E до физического устройства |

---

## 1. Структура репозитория

Один монорепозиторий, **нет** `packages/` (корневой `STAR_HOME_ARCHITECTURE.md` устарел).

| Путь | Роль |
|------|------|
| `apps/web` | Next.js 16 PWA: житель, админка, пост охраны, RPC-логика |
| `apps/api` | Nest: `/rpc`, `/live`, Prisma, опциональный runtime |
| `apps/gateway` | Локальный агент: HTTPS к облаку, без MQTT-клиента |
| `apps/api/prisma/schema.prisma` | Единая схема; web копирует через `postinstall` |

Два runtime (`apps/web/src/server/rpc-wire.ts`, `DEPLOY.md`):

- `STAR_HOME_RUNTIME=embedded` — Vercel+Neon, `embeddedRpc()` в `apps/web/src/server/persistence/embedded.ts`
- иначе HMAC POST на `STAR_HOME_API_URL` (Nest)

Оба пути вызывают `handleRpc` в `apps/web/src/server/rpc-handlers.ts`. **Нельзя** гонять embedded и API на одной БД одновременно (рассинхрон памяти).

Тесты: `apps/api/test/{rbac,security,adapters,device-channels}.test.ts` — in-memory store, без железа и без Playwright.

---

## 2. Что уже реализовано и стоит сохранить

### Платформа жилого объекта

- Иерархия Company → Object → Building → Unit → Room в снимке `catalog` (`catalog-store.ts`).
- Комнаты есть в данных и CRUD админки (корневой `SMART_HOME_ARCHITECTURE.md` здесь **устарел**: «комнат в данных нет»).
- Три режима жизни: HOME / WORK / VACATION (`life-modes.ts`). Ночь — сценарий, не 4-й режим.
- Житель: `/home`, `/rooms`, `/devices`, сценарии, охрана, заявки, PWA, уведомления.
- Админ: объекты, команда, роли, устройства, инженерия, аудит.
- Пост охраны: SOS, чат, JPEG-кадр камеры по запросу (без live).

### Права

- Сервер: `rbac/policy.ts`, `decide.ts`, `householdCan`, `reaches`, `placeFromSession`.
- Frontend **не** источник истины.
- Житель имеет `devices.view` и `devices.command` (корневой architecture-док здесь тоже устарел).
- Staff-методы в `methodPolicy` с явным permission.

### Устройства (модель)

Файлы: `ops-store.ts`, `device-capabilities.ts`, `device-channels.ts`, `device-registry.ts`, `device-discovery.ts`, `smart-home.ts`, `smart-commands.ts`.

- Одно устройство — много `channels[]` и `capabilities[]`.
- Место: OBJECT / STREET / ROOM, `roomId` необязателен.
- Стабильный внутренний `id`, внешний `externalId`, уникальность `gatewayId + externalId`.
- Качество канала: stale ~5 мин (`device-channels.ts`).
- UI жителя строится по возможностям, не по MQTT topic.
- Команда в UI принимается успехом только при `payload.confirmed === true` (`DeviceCommand.tsx`).
- HIGH-risk — confirm token на сервере.

### Шлюз (каркас)

- `Gateway` в `ops`: объект, адаптер, статус, hash токена (`ops-store.ts`).
- Пара / ротация / revoke: `gateway-channel.ts`.
- Очередь: `gateway-queue.ts` (PENDING → ACKED / FAILED / EXPIRED, TTL 15 мин).
- Агент: heartbeat, pull, ack, `kind: state` ingest.
- Cloud **не** открывает брокер в интернет: не-localhost MQTT → `broker-forbidden`.

### Честность (уже соблюдена в части контуров)

- Камеры: «Видеопоток не подключён», нет фейкового кадра.
- Wiren Board cloud `execute`: всегда `confirmed: false`.
- Агент на неизвестную команду: `agent-unapplied`, не ложный успех.
- ONVIF/Matter/Modbus/KNX/Zigbee/RS485: `adapter-unconfigured`.

### Прочее, не ломать

- Снимки JSON как рабочий SoT; Prisma — проекция.
- Аудит `audit-store.ts` + auto-audit RPC.
- Live: WS на Nest или poll `/api/live/pulse` ~20 с.
- Web Push (VAPID), бейджи, PWA-иконка.
- Design system, мобильная навигация.

---

## 3. Что работает частично

| Тема | Факт | Файлы |
|------|------|-------|
| Реестр устройств | CRUD и визард есть; новое устройство всегда `adapter: "local"` даже на WB-шлюзе | `device-registry.ts` `registerDevice` |
| Транспорт команды | Берётся `gateway.adapter`, не `device.adapter` | `gateway-adapter.ts` `adapterFor` |
| Discovery | Очередь `discover` + ack; источник — файл `STAR_HOME_WB_DISCOVERY`, не live MQTT | `device-discovery.ts`, `apps/gateway/agent.ts` |
| Ingest телеметрии | API есть; живые подписки нет | `gateway-channel.ts` `ingestGatewayState` |
| Онлайн non-local шлюз | Команда ставится в очередь **и** сразу зовёт cloud `executeOnAdapter` (WB всегда fail) | `smart-home.ts` `commandDeviceSmart` |
| Офлайн шлюз | Честно `confirmed: false`, `status: QUEUED` | `smart-home.ts` |
| Сценарии MANUAL / EVENT / LIFE_MODE | Облако, те же адаптеры | `scenarios.ts`, `life-modes.ts` |
| SCHEDULE | `runDueSchedules` из `smartHomeStatus` — нет cron | `smart-home.ts`, `scenarios.ts` |
| Климат | `readings[]` и `device.state` / каналы — два контура | `devices.ts`, `ops-store.ts` |
| Качество данных | STALE есть; local-устройства исключены из stale | `smart-home.ts` `isStale` |
| Погода | `staticOutdoorWeather` в сиде | `ops-store.ts` |
| Камеры | JPEG через агент; секреты не в браузере; live нет | `camera-media.ts`, `camera-capture.ts`, `CameraBlock.tsx` |
| Документация | Несколько SMART_HOME_*.md противоречат коду | корень и `docs/` |

---

## 4. Что является заглушкой или демо

### Демо-данные

- Сид устройств, показания 22.4 °C / 48 %, ворота, камеры, погода: `ops-store.ts` `seed()`.
- Пользователи: `people-store.ts` (в т.ч. stanislav / staff).
- `staticOutdoorWeather` — константа, не датчик.

### Адаптер `local`

`apps/web/src/server/gateway-adapter.ts` `LocalGatewayAdapter.execute`:

- OPEN/CLOSE и smart-команды → **`confirmed: true`** и `applyCommandState` **без железа**.
- Это рабочий демо-контур жителя. В пилоте с контроллером это **ложный успех**, если устройство ошибочно осталось на `local`.

### Wiren Board / MQTT

`apps/web/src/server/adapters/wirenboard.ts`:

- Нет пакета `mqtt` ни в одном `package.json`.
- `execute` никогда не публикует: `broker-unconfigured` / `broker-offline` / `broker-forbidden`.
- Алиас `mqtt` — тот же адаптер.

### Агент

`apps/gateway/agent.ts`:

- Discovery: JSON-файл; live MQTT cache на агенте.
- Команды WB: publish + echo; без echo — не `confirmed`.
- Локальный runtime сценариев и критических правил — этап 7 (`apps/gateway/local-runtime.ts`), не подтверждён на железе.

### Протоколы

`apps/web/src/server/adapters/protocol-stubs.ts` — все `adapter-unconfigured`.

### Камеры

Этап 8: JPEG-кадр через локальный агент (HTTP snapshot / ONVIF). Live RTSP/HLS в браузере нет. Секреты потока не отдаются клиенту. Железо камер не подтверждено. `docs/STAR_HOME_CAMERA_ARCHITECTURE.md`.

---

## 5. Источники истины (критичный риск)

**Рабочий SoT приложения:** пять JSON-снимков в PostgreSQL `Snapshot`: `catalog`, `people`, `ops`, `life`, `audit` (`store-bind.ts`, `embedded.ts`).

**Prisma-таблицы** (`schema.prisma`, `persistence/project.ts`) — проекция после ответа. Неполный зеркальный слой.

Не проецируются из `ops` (остаются только в JSON): `gateways`, `scenarios`, `smartEvents`, `smartHistory`, `gatewayCommands`, `discoveryScans`, `commandLogs`, `channels` как отдельная таблица, избранное, home layout.

Параллели внутри `ops`:

1. `device.state` (плоский) и `device.channels[]`.
2. `device.adapter` и `gateway.adapter` (транспорт — шлюз).
3. `readings[]` и climate channels.
4. Prisma `Automation` = строки режима жизни, **не** пользовательские `ops.scenarios`.
5. Два формата WB topic: упрощённый `wb/…` vs native `/devices/…/controls/…` (`wirenboard.ts` vs `wirenboard-controls.ts` / `apps/gateway/wb-controls.ts`).

Файл-фолбэк `data/*.json`, если store не bound — только dev.

**Вывод:** унификация нужна, но **разрушительная миграция Prisma→SoT сейчас запрещена**. План — в целевой архитектуре.

---

## 6. Путь команды (факт)

```
UI DeviceCommand
  → POST /api/smart-home/devices/[id]/command
  → rpc commandDeviceSmart (smart-home.ts)
  → RBAC, deviceCan, HIGH confirmToken
  → enqueueGatewayCommand (если шлюз не local)
  → если шлюз OFFLINE: confirmed:false QUEUED
  → иначе executeOnAdapter(gateway.adapter)
  → UI считает успех только при confirmed === true
```

Параллельно агент: pull → для управления всегда nack `agent-unapplied`.

Ack очереди применяет state **только** при `confirmed === true` (`gateway-queue.ts`).

---

## 7. Безопасность (аудит, не pentest)

Сохранить:

- Проверка прав на сервере; изоляция company/object через `reaches`.
- Токен шлюза: plaintext только при pair/rotate, в снимке hash.
- Агент: HTTPS к облаку (кроме localhost), исходящее соединение.
- Cloud не ходит в публичный MQTT.
- CSRF/origin на web writes; HMAC внутреннего RPC.
- Камеры и RTSP-секреты не отдаются в клиент.

Риски:

- Dev default `STAR_HOME_INTERNAL_SECRET=star-home-dev-internal` вне production (`internal-secret.ts`).
- `local` adapter в проде на пилотных устройствах = ложный успех.
- `security.manage` в permissions, к RPC не подключён.
- `security.camera.view` у жителя есть, RPC кадра — только staff.
- Нет тестов replay/gateway auth как отдельного security suite (частично `adapters.test.ts`, `security.test.ts`).
- Локальная автоматизация без облачной авторизации **не определена** (её просто нет).

---

## 8. Админ vs консоль специалиста

Есть: `/admin/devices`, `DeviceAddWizard.tsx`, карточка `/admin/devices/[id]`, шлюзы, discovery RPC, инженерия.

Цикл специалиста на `/admin/devices` (этапы 5–6):

- диагностика агента: версия, last contact и журнал обмена;
- проверка с временем ответа (`probeDevice`), без фальшивого `confirmed`;
- ввод в эксплуатацию «передать жильцу» / «забрать у жильца».

Ещё нет: live MQTT discovery как отдельный продукт (не этап 6).

---

## 9. Что заменить, что расширить

| Компонент | Решение |
|-----------|---------|
| PWA, RBAC, catalog, снимки, audit, live poll/WS | **Сохранить** |
| Модель Device/Channel/Gateway/Scenario в `ops` | **Сохранить и ужесточить контракты** |
| HTTP канал шлюза | **Сохранить**, нарастить семантику команд |
| `LocalGatewayAdapter` | **Оставить только** для явного demo/test; запретить как default на реальном шлюзе |
| Cloud `WirenBoardAdapter.execute` | **Не** делать cloud MQTT-клиентом. Управление — только через агента |
| `apps/gateway/agent.ts` | **Расширить**: MQTT LAN, apply+ack, буфер, локальные сценарии (этапы 2–4, 7) |
| protocol-stubs | Оставить заглушками до отдельных этапов |
| Камеры | Этап 8: JPEG-снимок через агент, не sensor model; live HLS — позже |
| Корневые устаревшие `SMART_HOME_ARCHITECTURE.md`, `SMART_HOME_GATEWAY_ARCHITECTURE.md` | Пометить / заменить целевыми docs после согласования |
| Prisma как SoT устройств | **Не** сделано. План: `docs/STAR_HOME_PRISMA_PLAN.md` |
| Backup / restore снимков | Этап 9: export в админке; restore только с `STAR_HOME_ALLOW_RESTORE=1` |
| Мониторинг агента | Heartbeat `bufferLag` / `mqtt`; stale 90 с |

---

## 10. Зависимости между модулями

```
rpc-handlers
  → smart-home / device-registry / scenarios / life-modes / security-desk
    → ops-store (SoT)
    → gateway-adapter → wirenboard | local | http | stubs
    → gateway-queue → gateway-channel ← apps/gateway/agent
    → rbac/decide
    → publishLive, pushNotice
  → persistence/embedded → Snapshot + project.ts (проекция)
```

UI жителя зависит от `confirmed` и карточек `smart-home.ts`. Ломать контракт `confirmed` нельзя: это защита от ложного успеха.

Сиды `ops-store` кормят демо. Пилот на живой БД: **не** reseeding.

---

## 11. Соответствие критериям пилота (ТЗ §17)

| № | Критерий | Сейчас |
|---|---------|--------|
| 1 | Контроллер обнаруживается через шлюз | Только JSON discovery, не брокер |
| 2 | Устройства и каналы в STAR HOME | Да, модель и UI |
| 3 | Значения с физического оборудования | Нет (файл/сид/local) |
| 4 | Актуальность данных | Частично (stale 5 мин) |
| 5 | Потеря связи видна | Частично (шлюз OFFLINE) |
| 6 | Команда доходит до устройства | Нет |
| 7 | Подтверждение выполнения | Контракт есть, железа нет |
| 8 | Нет ложного успеха | Для WB/агента — да; для `local` — нет |
| 9 | Локальные сценарии без интернета | Нет |
| 10 | Синхронизация после reconnect | Ingest есть, полноценного буфера нет |
| 11 | Изоляция объектов | Да, RBAC |
| 12 | Права на сервере | Да |
| 13 | Журнал | Да |
| 14 | Backup/restore | Neon/snapshot, процедуры пилота нет |
| 15 | Критические тесты | Частично, без железа |
| 16 | Инструкция специалиста | README агента, нет runbook ввода |
| 17 | Ввод в эксплуатацию E2E | Нет |

---

## 12. Вывод этапа 0

Платформа **уже умеет** быть цифровым слоем жилого объекта: люди, дома, права, честный UI, очередь к шлюзу, каналы, запрет cloud MQTT.

Платформа **ещё не умеет** закрыть пилот на железе: live Wiren Board и ONVIF-камеры на объекте не подтверждены; Prisma не SoT; live HLS камер нет.

Следующий шаг после согласования — **не** большое переписывание, а ужесточение контрактов (этап 1) и затем реальный агент+MQTT (этапы 2–4).

Целевая архитектура и план: `docs/STAR_HOME_TARGET_ARCHITECTURE.md`.

**Дополнение 2026-09-28:** этап 1 выполнен. Dual execute WB убран, регистрация копирует адаптер шлюза, пустой канал не становится 0. Агент по-прежнему не применяет команды. Отчёт: `docs/STAR_HOME_IMPLEMENTATION_REPORT.md`.
