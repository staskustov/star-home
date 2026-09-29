# STAR HOME — полный аудит проекта

Дата проверки: 2026-09-29  
Репозиторий: `/Users/staskustov/star-home`  
Ветка: `cursor/star-mark-icon-and-http-session`  
Режим: только чтение кода, документации и существующих тестов. Исходный код, схема БД и конфигурация **не изменялись**.

Авторы ролей аудита: архитектура, full-stack, IoT, ИБ, тестирование, UX/UI.

---

## 1. Резюме для владельца проекта

STAR HOME — живой многоарендаторский продукт (PWA, админка, пост охраны) с серверным RBAC и честным контрактом команды для **smart-home RPC**: успех в карточке устройства только при `confirmed: true`.

Целевой контур «облако не контроллер → исходящий агент → MQTT Wiren Board в LAN» **реализован в программном коде** (`apps/gateway`, очередь, ack, телеметрия). Это **не** доказательство работы на физическом контроллере: в CI нет брокера объекта, нет ONVIF-камеры, нет пилотного LAN.

**Ответ на главный вопрос аудита:** как платформа жилого объекта и каркас управления железом система **частично соответствует** целевой архитектуре (оценки по направлениям 55–80% для софта). Как платформа, **способная управлять реальным оборудованием, работать без интернета на объекте и масштабироваться на пилот** — **не готова**. Критический пробел — отсутствие E2E до физического устройства плюс демо-контур (`adapter: "local"`, сид), который выглядит как живой дом.

Ориентиры (экспертные, не среднее арифметическое):

| Слой | Оценка | Смысл |
|------|--------|--------|
| Продукт облака (житель, RBAC, объекты) | ~75% | Работает на сиде и production `https://star-home.space` |
| Программный контур шлюза / MQTT / команд | ~65–72% | Код и unit/integration тесты есть |
| Пилот на физическом оборудовании | **~15%** | Нечем подтвердить реле, echo WB, ONVIF |

Критические блокеры пилота: нет проверки на Wiren Board; демо-`local` подтверждает команды без железа; путь ворот `/api/access/gate` **не ставит команду в очередь агента**; нет UI создания шлюза; облачной SCHEDULE нет отдельного cron.

---

## 2. Область и ограничения аудита

**Проверено**

- Исходный код `apps/web`, `apps/api`, `apps/gateway`.
- Prisma-схема `apps/api/prisma/schema.prisma` и проекция `apps/web/src/server/persistence/project.ts`.
- Документы `docs/STAR_HOME_*.md`, корневые `SMART_HOME_*.md`, `DEPLOY.md`.
- Существующие тесты (запуск 2026-09-29, in-memory, без записи в Neon):
  - `cd apps/api && ./node_modules/.bin/tsx --test test/*.test.ts` → **181 passed, 0 failed**.
  - `cd apps/gateway && ./node_modules/.bin/tsx --test test/*.test.ts` → **24 passed, 0 failed**.
- Ранее в этой сессии (после деплоя этапа 9): `GET https://star-home.space/api/health` → `{ ok: true, runtime: "embedded" }`; экран `/admin/settings` с панелью снимка. Это подтверждает **наличие** health и UI backup на production, не работу железа.

**Не проверялось (ограничения)**

- Физический Wiren Board, MQTT-брокер объекта, ONVIF/RTSP камера.
- Установка и длительная работа агента на объекте без интернета.
- Mutual TLS, OTA агента (в коде не найдены).
- Playwright / браузерный E2E в этом прогоне (фреймворка нет в `package.json`).
- Банковский шлюз (`STAR_HOME_BANK_URL` не задан в проверяемом контуре).
- Разрушающие тесты безопасности, перебор токенов, нагрузка Neon.
- Restore на production (флаг `STAR_HOME_ALLOW_RESTORE` не включался).

**Правило статусов:** «ГОТОВО» только если слой UI + сервер + тесты согласованы **и** требование не зависит от непроверенного железа. Цепочка до физического актуатора всегда **НЕ ПРОВЕРЕНО**, даже если софт полный.

---

## 3. Методика проверки

1. Сверка с `docs/STAR_HOME_TARGET_ARCHITECTURE.md` и настоящим промптом.
2. Трассировка цепочек: RPC → store → адаптер/очередь → агент.
3. Поиск заглушек: `adapter-unconfigured`, `local`, `LedgerProvider`, `intentFromPrompt`, сид `metadata.demo`.
4. Запуск существующих тестов без БД продукта.
5. Фиксация противоречий документов без выбора «удобной» версии.

Старые отчёты **не** принимались как факт: `docs/STAR_HOME_CURRENT_STATE_AUDIT.md` (2026-09-28) в таблице говорит «MQTT нет» и «агент не применяет», что **противоречит** текущему `apps/gateway`.

---

## 4. Общая оценка состояния

Архитектурный выбор (JSON Snapshot SoT, облако без MQTT-клиента, агент исходящий HTTPS) **соблюдён в коде**. Этапы 1–9 из TARGET **закрыты в софте**, как описано в `docs/STAR_HOME_IMPLEMENTATION_REPORT.md`.

Система масштабируется как **мультиарендный SaaS на снимках JSON** (несколько объектов/компаний в catalog), но не как зрелый IoT-контроллер: протоколы кроме WB/HTTP/local — заглушки; Prisma Device не полная модель; нет доказанного offline-пилота.

Демо-сид КП «Сияние» создаёт впечатление работающего дома (свет, погода 12,4 °C, камеры «На связи») при `adapter: "local"` и пустом `cameraMedia`.

---

## 5. Таблица соответствия требованиям

| № | Направление | Требование | Статус | Доказательства | Что отсутствует | Следующий шаг |
| - | ----------- | ---------- | ------ | -------------- | --------------- | ------------- |
| 1.1 | Архитектура | Cloud не MQTT-клиент брокера | **ГОТОВО** | `apps/gateway/mqtt-session.ts`; в `apps/web` нет `import "mqtt"`; `WirenBoardAdapter.execute` не публикует (`adapters/wirenboard.ts`) | — | Сохранить инвариант |
| 1.2 | Архитектура | Frontend / backend / агент разделены | **ГОТОВО** | `apps/web` PWA+RPC, `apps/api` Nest HMAC, `apps/gateway` агент | Два runtime на одной БД запрещены докой (`DEPLOY.md`) | Не смешивать embedded и Nest |
| 1.3 | Архитектура | JSON Snapshot SoT | **ГОТОВО** | `store-bind.ts` имена catalog/people/ops/life/audit; `embedded.ts` таблица `Snapshot` | Prisma Device без каналов/шлюза (`schema.prisma` Device) | Cutover только по `STAR_HOME_PRISMA_PLAN.md` |
| 1.4 | Архитектура | UI не читает Prisma Device | **ГОТОВО** | `prisma.device` только в `project.ts`; `home()` → `readOps()` (`rpc-handlers.ts`) | Проекция неполная | Не переключать чтение |
| 1.5 | Архитектура | Несколько независимых проектов | **ГОТОВО** | `catalog-store` Company→Object; тесты `security.test.ts` «another company» | — | — |
| 1.6 | Архитектура | Несколько шлюзов на объекте | **ГОТОВО** | `gatewaysForObject` (`ops-store.ts`); `createGateway` без лимита «один» | Нет UI создания шлюза | Форма createGateway в админке |
| 1.7 | Архитектура | Изоляция данных | **ГОТОВО** (софт) | `reaches`, `objectFor`, `deviceFor` companyId; 404/403 чужой компании | Канал шлюза — токен, не сессия | Сохранить тесты матрицы |
| 1.8 | Архитектура | Новые протоколы без ядра | **ЧАСТИЧНО** | `registerGatewayAdapter` (`gateway-adapter.ts`); stubs matter/modbus/knx/zigbee/onvif/rs485 | Реальный apply в агенте только HTTP/MQTT/echo/discover/camera | Адаптер агента + тесты |
| 1.9 | Архитектура | Документы = код | **ЧАСТИЧНО** | Актуальны `docs/STAR_HOME_GATEWAY_ARCHITECTURE.md`, COMMAND, CAMERA, IMPLEMENTATION | Корневые `SMART_HOME_ARCHITECTURE.md`, `SMART_HOME_GATEWAY_ARCHITECTURE.md` «код не писался»; CURRENT_STATE_AUDIT таблица MQTT устарела | Согласовать канон docs/ |
| 2.1 | Модель | Project/Building/Unit/Room | **ГОТОВО** | ТЗ Project = Object (`catalog-store.ts`); Room в catalog; UI `/admin/objects` | Floor — поле комнаты, не сущность | — |
| 2.2 | Модель | Gateway/Device/Channel/Capability | **ГОТОВО** | типы `ops-store.ts`; register копирует adapter (`device-registry.ts`) | Prisma без Channel/Gateway | — |
| 2.3 | Модель | Несколько каналов, room необязателен | **ГОТОВО** | `place` OBJECT/STREET/ROOM; `findDuplicateDevice` | — | — |
| 2.4 | Модель | Telemetry/Command/Automation/Event/Audit | **ГОТОВО** (хранение) | channels + `smartHistory`; `gatewayCommands`; `scenarios`; `smartEvents`; snapshot `audit` | Dual `readings[]` vs channels | Свести climate к каналам |
| 2.5 | Модель | UI по capabilities, не по вендору | **ГОТОВО** | `device-capabilities.ts`, `asCard` | Список `/devices` упрощён (`homeSignals`) | Выровнять list и detail |
| 3.1 | Шлюз | Рабочий программный агент | **ГОТОВО** (софт) | `apps/gateway/agent.ts` tick heartbeat/pull/apply/ack; README | Установка как systemd/пакет не в репо | Runbook на объекте |
| 3.2 | Шлюз | Идентификация / pairing | **ГОТОВО** | SHA-256 `tokenHash`, plaintext один раз (`gateway-channel.ts` `pairGateway`); тесты `production.test.ts` | mTLS нет | Опционально mTLS |
| 3.3 | Шлюз | Буфер, reconnect, stale 90 с | **ГОТОВО** (софт) | `outbound-buffer.ts`; `mqtt-session.ts`; `gateway-contact.ts` `gatewayStaleMs` | Не проверено на объекте | Полевой тест обрыва |
| 3.4 | Шлюз | Работа без интернета | **ЧАСТИЧНО** | Локальный runtime EVENT/SCHEDULE/critical (`local-runtime.ts`); буфер исходящих в cloud | Нет LIFE_MODE на агенте; нет полевого теста | Полевой offline |
| 3.5 | Шлюз | Обновление агента | **НЕ ГОТОВО** | grep OTA/self-update в `apps/gateway` — пусто | Канал обновления | Политика версии `agent-6` вручную |
| 4.1 | MQTT | Клиент только на агенте | **ГОТОВО** | `mqtt` в `apps/gateway/package.json`; localhost (`broker-url.ts`) | — | — |
| 4.2 | MQTT | Subscribe, retained, discovery | **ГОТОВО** (софт) | `/devices/+/controls/+`; seq wait (`topic-cache.ts`); fallback `STAR_HOME_WB_DISCOVERY` | Live discovery на контроллере | **НЕ ПРОВЕРЕНО** железо |
| 4.3 | MQTT | Связь с физическим WB | **НЕ ПРОВЕРЕНО** | Тесты с фейковым клиентом (`gateway.test.ts`) | Контроллер, брокер LAN | Пилот Сияние |
| 5.1 | Команды | Очередь WB, cloud не execute | **ГОТОВО** (софт) | `commandDeviceSmart` remote → `enqueueGatewayCommand` (`smart-home.ts`); `command-contracts.test.ts` | — | — |
| 5.2 | Команды | accepted / sent / confirmed | **ГОТОВО** (smart-home) | статусы API; SENT не пишет state (`gateway-queue.ts`); UI `DeviceCommand.tsx` | Resident не ждёт ack в том же запросе для WB | Live/pulse после ack |
| 5.3 | Команды | MQTT echo confirm | **ГОТОВО** (софт) | `apply.ts` `applyMqtt`; timeout/retry | Эхо топика ≠ контактор | Железо |
| 5.4 | Команды | Ворота OPEN/CLOSE | **ЧАСТИЧНО** | `operations.ts` `commandDevice` → `runDevice` → `executeOnAdapter` **без очереди** | WB-ворота с приложения доступа не ставятся агенту | Тот же enqueue, что smart-home |
| 5.5 | Команды | Нет фиктивного успеха | **ЧАСТИЧНО** | Remote WB: `confirmed: false` на RPC; DeviceCommand откатывает | `LocalGatewayAdapter` и echo/demo подтверждают без железа; optimistic toast «Открыто» (`ResidentHomeScreen.tsx`) | Запрет local на пилоте; убрать ранний toast |
| 6.1 | Телеметрия | Ingest + quality + пусто≠0 | **ГОТОВО** (софт) | `ingestGatewayState`; `device-channels.test.ts` | Агент шлёт state пакетом на tick (~20 с) | Опционально push on change |
| 6.2 | Телеметрия | История без выдумки точек | **ГОТОВО** (софт) | `recordSmartHistory` downsample 5 мин | Сидовые 22,4 °C / 12,4 °C выглядят как live | Маркер demo в UI |
| 6.3 | Телеметрия | Реальные значения с контроллера | **НЕ ПРОВЕРЕНО** | — | Брокер объекта | Пилот |
| 7.1 | Автоматизация | CRUD сценариев | **ГОТОВО** | `scenarios.ts`; UI жителя | — | — |
| 7.2 | Автоматизация | runtime cloud\|gateway | **ГОТОВО** | `automation.ts`; UI «в облаке» / «на шлюзе» / «шлюз не исполняет» (`ScenarioList.tsx`) | — | — |
| 7.3 | Автоматизация | Локальный EVENT/SCHEDULE/critical | **ГОТОВО** (софт) | `local-runtime.ts`; `automation.test.ts`; gateway tests | Железо | Пилот |
| 7.4 | Автоматизация | LIFE_MODE на агенте | **НЕ ГОТОВО** | `evaluateEvents`/`evaluateSchedule` только; cloud `runLifeModeScenarios` только `runtime === "cloud"` | Исполнение gateway LIFE_MODE | Либо агент, либо запрет runtime |
| 7.5 | Автоматизация | Cloud SCHEDULE без cron | **ЧАСТИЧНО** | `runDueSchedules` из `smartHomeStatus` (`smart-home.ts`) | Нет worker на Vercel | Cron или только gateway SCHEDULE |
| 8.1 | Консоль | Объект, комнаты, регистрация, probe, handover | **ГОТОВО** (софт) | `ObjectDraftSheet`, `ObjectBuilder`, `DeviceAddWizard`, `device-commission.ts`, `device-commission.test.ts` | — | — |
| 8.2 | Консоль | Создать шлюз в UI | **НЕ ГОТОВО** | RPC `createGateway` + `POST /api/smart-home/gateways`; grep UI POST — только pair/rotate/revoke (`OpsDesk.tsx`) | Форма создания | Добавить UI (вне этого аудита) |
| 8.3 | Консоль | Discovery без ручного MQTT | **ЧАСТИЧНО** | Очередь `discover` + кэш агента или JSON snapshot | Живой брокер | Пилот |
| 9.1 | Камеры | JPEG через агент, не live | **ГОТОВО** (софт) | `camera-media.ts`, `camera-capture.ts`; RTSP без snapshot → `rtsp-live-unsupported`; echo не рисует JPEG | Live HLS | Отдельный этап |
| 9.2 | Камеры | Секреты не в браузере | **ГОТОВО** | `publicMedia` без пароля; pack на pull; `camera.test.ts` | — | — |
| 9.3 | Камеры | Сид честно не подтверждает кадр | **ГОТОВО** | `camera.test.ts` unconfigured | UI «На связи» по `work` (`ops-store.ts` `homeSignals`) | Считать online по media/frame |
| 9.4 | Камеры | Физическая камера | **НЕ ПРОВЕРЕНО** | — | ONVIF в LAN | Пилот |
| 10.1 | Безопасность | Сессия, RBAC, origin, HMAC | **ГОТОВО** | `session.ts`, `rpc-handlers.ts` methodPolicy, `same-origin.ts`, `security.test.ts` | Login limit in-memory (`login-limit.ts`) | Shared limiter |
| 10.2 | Безопасность | Pairing hash, restore gate | **ГОТОВО** | `production.test.ts`; `STAR_HOME_ALLOW_RESTORE` | Backup содержит passwordHash и пароли камер | Операционный vault |
| 10.3 | Безопасность | Канал шлюза публичен | **ЧАСТИЧНО** | `proxy.ts` public `/api/smart-home/gateways/channel`; секрет = токен | mTLS, IP allowlist | По политике пилота |
| 11.1 | UX | PWA, мобильная навигация жителя | **ГОТОВО** | manifest, `sw.js` (prod), `BottomNavigation.tsx` | Offline — урезанный `offline.html` | — |
| 11.2 | UX | Успех команды = confirmed | **ГОТОВО** | `DeviceCommand.tsx` | Optimistic «Открыто»; AccessPanel не передаёт `canCommand` (default true) | Исправить UX |
| 11.3 | UX | Три режима жизни, ночь = сценарий | **ГОТОВО** | `life-modes.ts`; `scen_night_24` | Копирайты режима не равны live-охране | — |
| 12.1 | Тесты | RBAC, команды, камеры, backup, агент | **ГОТОВО** | 181 + 24 теста 2026-09-29 | Playwright, железо, E2E UI | Полевой чеклист |
| 12.2 | Производство | Backup/health/docs этапа 9 | **ГОТОВО** (софт) | `ops-backup.ts`, `/api/health`, `STAR_HOME_DEPLOYMENT_GUIDE.md` | Restore в prod выключен намеренно; 152-ФЗ (Neon EU) | Юридический контур РФ |

---

## 6. Подробные результаты по направлениям

### 6.1 Архитектура

Фактическая схема совпадает с TARGET §2: браузер → RPC (`handleRpc`) → очередь/адаптер → `POST /api/smart-home/gateways/channel` → агент → MQTT localhost.

Два runtime: `STAR_HOME_RUNTIME=embedded` (Vercel+Neon) и HMAC на Nest (`rpc-wire.ts`). Оба вызывают те же обработчики.

Бизнес-логика и протоколы разделены регистрацией адаптеров; **логика маппинга WB дублируется** (`apps/web/src/server/adapters/wirenboard-controls.ts` и `apps/gateway/wb-controls.ts`) — риск расхождения.

**Противоречия документов**

| Документ | Утверждение | Код |
|----------|-------------|-----|
| `STAR_HOME_TARGET_ARCHITECTURE.md` шапка | «Код целевого контура не писался» | Этапы 1–9 в IMPLEMENTATION_REPORT |
| `STAR_HOME_CURRENT_STATE_AUDIT.md` таблица | MQTT нет; агент не apply | `mqtt-session.ts`, `apply.ts` |
| `SMART_HOME_ARCHITECTURE.md` | Phase 0, комнат нет, у жителя нет command | Комнаты и `devices.command` есть |
| `apps/gateway` vs CURRENT_STATE_AUDIT §1 | «gateway без MQTT-клиента» | MQTT есть |

**Вопрос владельцу:** какой документ канонический после этапа 9 — `docs/STAR_HOME_*` или корневые `SMART_HOME_*`?

### 6.2 Модель устройств

Иерархия Company → Object (ТЗ Project) → Building → Unit → Room в снимке `catalog`. Устройства и шлюзы в `ops`. Capability определяет UI, не MQTT topic.

Prisma `Device`/`DeviceState` — урезанная проекция после ответа, не SoT.

### 6.3 Локальный шлюз

Это **работающий программный компонент**, не концепт: цикл `tick`, pairing, heartbeat `agent-6` с `bufferLag`/`mqtt`, apply, буфер диска, local-runtime.

Не пакетный инсталлятор, не OTA, не mTLS. Без интернета: критические правила и сценарии gateway runtime на агенте **заложены**, **не гонялись на объекте**.

### 6.4 Wiren Board и MQTT

Клиент MQTT только у агента; чужой хост брокера запрещён. Тесты подтверждают echo, timeout, retained seq, reconnect **на фейках**. Физический контроллер — **НЕ ПРОВЕРЕНО**.

### 6.5 Реальное выполнение команд

Цепочка smart-home до агента прослежена (см. таблицу). Для **демо-света** `confirmed: true` в облаке без агента — это явный demo, не пилот.

Для **ворот с главного экрана** цепочка обрывается на `executeOnAdapter` без enqueue — на paired WB команда не уйдёт агенту.

### 6.6 Телеметрия

Ingest по `externalId`, quality, stale ~5 мин, downsample истории — в коде и тестах. Источник значений на сиде — JSON, не брокер. `readings[]` дублирует climate.

### 6.7 Автоматизация

Runtime исполняется: облако (EVENT после команды, SCHEDULE при poll status, LIFE_MODE при смене режима) и агент (EVENT/SCHEDULE/critical). Честный UI runtime. Дыры: LIFE_MODE+gateway; SCHEDULE облака без cron.

### 6.8 Консоль специалиста

Цикл ввода **кроме создания шлюза в UI** закрыт кодом: объект (`ObjectDraftSheet`), визард устройства, discover RPC, probe, handover, права жителей отдельно в `/admin/residents`. Без UI шлюза специалист не проходит greenfield только кликами, если шлюза нет в сиде.

### 6.9 Камеры

Отдельная подсистема JPEG, не сенсор. Нет live. Сид без потока не подтверждает кадр (тест). UI дома считает камеру «На связи» по `work === ON`.

Отсутствует для полноценного видеонаблюдения: HLS/RTSP в браузере, облачный прокси, аппаратная проверка ONVIF, запись архива.

### 6.10 Безопасность

Сильные стороны: права на сервере, матрица методов, origin, HMAC, pairing hash, restore-гейт, камера без пароля в браузере.

Риски: публичный channel по токену; backup со секретами; in-memory rate limit на Vercel; демо-логины; HTTP-адаптер в облаке доверяет JSON `confirmed`; нет mTLS.

### 6.11 Frontend и UX

Визуальный язык и мобильный док жителя сохранены. Главный риск UX — **вид работающего объекта на сиде** и optimistic toasts доступа. Админка без нижнего дока (drawer) — приемлемо.

### 6.12 Тестирование и производство

Сильный слой RPC/агент. Нет E2E UI. Backup/health/документы этапа 9 на месте. Restore в production выключен. Пилот железа не закрыт тестами.

---

## 7. Найденные заглушки и демонстрационные данные

| Что | Где | Эффект |
|-----|-----|--------|
| `adapter: "local"` + `metadata.demo: true` | `ops-store.ts` seed | Мгновенный `confirmed: true` |
| `LocalGatewayAdapter` | `gateway-adapter.ts` | Успех без актуатора |
| `STAR_HOME_GATEWAY_ECHO` / `STAR_HOME_DEMO` | `agent.ts`, `apply.ts` | Подтверждение без брокера |
| Protocol stubs | `protocol-stubs.ts` | `adapter-unconfigured` |
| Погода 12,4 °C | `staticOutdoorWeather` / demo WEATHER | Вид живого датчика |
| Климат 22,4 °C | сид + `readings` | То же |
| Камеры ON без `cameraMedia` | seed | «На связи» / «В работе» |
| `LedgerProvider` | `payments.ts` | Оплата без банка, если нет `STAR_HOME_BANK_URL` |
| AI | `ai-intent.ts` правила, не GPT | Диалог без внешней LLM |
| `mocks/resident-home.ts` | копирайты режимов | Текст «охрана включена» ≠ live alarm |
| Небо главной | `HomeCover.tsx` JPG | Не погода API |

---

## 8. Архитектурные проблемы

1. Два контура команд: smart-home очередь vs `runDevice` для доступа.
2. Дубль WB-маппинга web/gateway.
3. List `/devices` vs detail smart-home — разная полнота модели.
4. JSON SoT + неполная Prisma — отчёты по SQL Device лгут относительно каналов.
5. Cloud SCHEDULE завязан на poll, не на scheduler.
6. Устаревшие корневые SMART_HOME docs vs `docs/STAR_HOME_*`.

---

## 9. Проблемы безопасности

| Описание | Последствие | Компоненты | Критичность | Рекомендация (не делалась) |
|----------|-------------|------------|-------------|----------------------------|
| Демо-`local` confirmed | Ложное «сделано» | `gateway-adapter.ts`, сид | P0 для пилота | Запрет local на объекте с железом |
| Channel без сессии | Кража токена = канал объекта | `proxy.ts`, `gateways/channel` | P1 | Ротация, mTLS, хранение токена только на агенте |
| Backup JSON с хешами и паролями камер | Утечка файла = захват учёток/камер | `ops-backup.ts` | P1 | Vault, шифрование at rest |
| Login/command rate limit в памяти | Обход на нескольких инстансах Vercel | `login-limit.ts`, `smart-home.ts` | P2 | Redis/Neon limiter |
| Cloud HTTP adapter: любой `confirmed: true` | Поддельный успех HTTP-устройства | `gateway-adapter.ts` HttpGatewayAdapter | P2 | Та же строгость, что у агента |
| Демо-логины admin/admin | Известные учётки | `people-store.ts` | P1 на пилоте | Смена паролей, не reseeding |
| Нет mTLS агента | MitM на пути агент→cloud при компрометации TLS публичного CA всё ещё зависит от HTTPS | агент | P2 | По политике |
| Access UI default `canCommand=true` | Кнопки видны, API 403 | `AccessPanel.tsx` | P3 UX / P2 путаница | Передавать флаг с сервера |

Разрушительные тесты не проводились.

---

## 10. Результаты тестирования

**Запускалось 2026-09-29 (этот аудит):**

```
apps/api:  tesx --test test/*.test.ts   → 181 passed, 0 failed
apps/gateway: tsx --test test/*.test.ts → 24 passed, 0 failed
```

Покрыто: RBAC, изоляция компаний, origin, HMAC, pairing, очередь, SENT≠state, stale 90 с, bufferLag/mqtt heartbeat, камеры JPEG, automation pack, backup/restore гейт, MQTT echo на фейке, critical leak.

**Не прошли:** нет.

**Отсутствуют:** Playwright, тест UI AccessPanel, тест createGateway UI, E2E агент↔Neon, hardware, `/api/health` в Node-наборе (маршрут есть; production health проверялся отдельно curl).

**Невозможно без оборудования:** MQTT echo с контроллера, ONVIF JPEG, offline дом, probe реле.

Успех unit-тестов **не** равен готовности пилота.

---

## 11. Критические блокеры

1. Нет E2E до физического Wiren Board / камеры — пилот «реальным оборудованием» не подтверждён.
2. Сид + `local` создают ложный успех команд и «живую» телеметрию.
3. Ворота из сценария доступа не ставятся в очередь агента (`operations.ts` → `runDevice`).
4. Нет UI создания шлюза — greenfield комиссия неполная.
5. Несогласованные документы могут привести к неверным решениям («MQTT нет»).

Без п.1 система остаётся демо-платформой с правильным каркасом.

---

## 12. Приоритизированный список задач

### P0

| Проблема | Доказательство | Последствия | Модули | Порядок |
|----------|----------------|-------------|--------|---------|
| Ложный успех demo local на пилоте | `LocalGatewayAdapter`, seed `metadata.demo` | Оператор думает, что реле сработало | gateway-adapter, ops-store, UI | Запрет local на paired/пилотном объекте; бейдж demo |
| Ворота не в очереди агента | `operations.ts` `commandDevice` / `devices.ts` `runDevice` | Физические WB-ворота с /access и чипов не управляются | operations, smart-home, queue | Единый command path |
| Нет полевого E2E | Нет брокера в CI; docs «не подтверждено» | Нельзя объявлять пилот | gateway, канал | Чеклист на объекте (раздел 21 отчёта) |

### P1

| Проблема | Доказательство | Последствия | Модули | Порядок |
|----------|----------------|-------------|--------|---------|
| Нет UI createGateway | grep компонентов: нет POST create | Специалист правит API/seed | OpsDesk, ObjectBuilder | Форма в /admin/devices |
| LIFE_MODE runtime gateway мёртв | `local-runtime.ts` без LIFE_MODE | Смена режима не исполнит локальные шаги без облака | automation, agent | Реализовать или запретить |
| Cloud SCHEDULE без cron | только `smartHomeStatus` | Расписание «есть в UI», не бежит ночью | scenarios, deploy | Cron или только gateway |
| Камеры «На связи» без потока | `homeSignals` state от `work` | Ложная готовность видео | ops-store, CameraBlock | Статус от cameraMedia |
| Демо-пароли на пилоте | people-store | Компрометация | people | Смена паролей |
| Backup-секреты | ops-backup | Утечка снимка | ops-backup, ops | Политика хранения |
| AccessPanel canCommand | default true | Лишние кнопки | AccessPanel | Проброс с RPC |

### P2

Дубль WB mapping; list vs detail устройств; in-memory limiter; HTTP cloud confirmed; нет OTA; нет mTLS; telemetry batch 20 с; 152-ФЗ / Neon EU.

### P3

Админ без bottom dock; декоративное небо; вычистить корневые SMART_HOME Phase 0; Playwright; live HLS (отдельный продукт).

---

## 13. План реализации

Не предлагается переписывать платформу. Развивать текущий контур Snapshot + агент.

### Этап A — Честный пилот (минимум до железа)

**Цель:** ни один экран не показывает успех без агента/адаптера на объекте.  
**Задачи:** единый enqueue для ворот; скрыть/пометить demo; UI createGateway; статус камеры от media.  
**Модули:** operations, smart-home, OpsDesk, ops-store, CameraBlock.  
**Зависимости:** нет железа.  
**Результат:** специалист заводит шлюз в UI; житель не видит «Сделано» на local, если объект пилотный.  
**Приёмка:** тесты очереди ворот; UI-тест статуса камеры (хотя бы RPC).  
**Риск:** сломается демо-сидение света.  
**Параллельно:** смена паролей, политика backup.

### Этап B — Полевой контур WB

**Цель:** один физический контроллер localhost MQTT.  
**Задачи:** агент на объекте; discovery; команда + echo; телеметрия; обрыв/reconnect.  
**Модули:** gateway, канал, админка last contact.  
**Зависимости:** A, доступ в LAN, учётные MQTT.  
**Приёмка:** чеклист раздела «что проверить на железе».  
**Риск:** retained/timeout на реальном WB.  
**Параллельно:** ONVIF snapshot одной камеры.

### Этап C — Автоматизация на объекте

**Цель:** протечка/пожар и SCHEDULE без облака.  
**Задачи:** полевой тест local-runtime; LIFE_MODE решение; облачной SCHEDULE — cron или отказ.  
**Зависимости:** B.  
**Параллельно:** документация канона.

### Этап D — Укрепление производства

Rate limit, mTLS по решению, Prisma только по отдельному согласованию, Playwright на критичных экранах, юрисдикция данных.

### Минимальный набор для первого реального пилота

1. Этап A (ворота + demo + createGateway).  
2. Агент `agent-6` + токен + `mqtt://127.0.0.1`.  
3. Одно устройство WB (реле) + одна команда + одно показание.  
4. Запрет `STAR_HOME_GATEWAY_ECHO` и `STAR_HOME_DEMO` на объекте.  
5. Смена демо-паролей.  
6. Не включать `STAR_HOME_ALLOW_RESTORE` на production.

---

## 14. Критерии готовности к пилоту

Пилот можно объявлять, когда:

1. На объекте агент ONLINE, MQTT `up`, lastSeen < 90 с.  
2. Команда с UI жителя доходит до WB и `confirmed: true` только после echo (или HTTP `confirmed===true` с устройства).  
3. Ворота/точки доступа идут тем же путём очереди.  
4. На пилотном объекте нет confirming `local` для боевых устройств.  
5. Камера либо честно «поток не подключён», либо реальный JPEG.  
6. Backup скачан и лежит вне git; restore выключен.  
7. Документы Phase 0 не используются как SoT решений.

Сейчас критерии **1–5 не выполнены** (нет железа / есть demo / ворота). **6** выполнен в софте.

---

## 15. Вопросы владельцу проекта

1. Канон документации: удалять/помечать корневые `SMART_HOME_*.md` как архив?  
2. Пилот Сияние: дата доступа к WB и камере, кто ставит агент?  
3. Демо-контур в production: оставлять `local` для витрины или разделить demo/pilot?  
4. Оплата: нужен ли реальный банк или ledger достаточен?  
5. AI: оставлять правила `ai-intent` или подключать внешнюю LLM (сейчас GPT нет)?  
6. Prisma cutover: согласовать отдельно или JSON SoT на весь пилот?  
7. Юрисдикция ПДн (Neon `eu-central-1` vs РФ)?  
8. Нужен ли live HLS камер до первого пилота реле (рекомендация аудита: **нет**)?  
9. Ворота: подтверждаете перевод access API на очередь агента?  
10. Создание шлюза: только UI или допустим одноразовый RPC при вводе?

---

## Что реально работает сегодня

Подтверждено кодом и тестами (и частично production UI):

- Вход, сессии, RBAC, изоляция компаний/объектов, журнал аудита.
- Каталог объектов, корпусов, квартир, комнат; три режима жизни; ночь как сценарий.
- PWA жителя, админка, пост охраны (SOS, чат, проверка пропуска).
- Реестр устройств, каналы, capabilities, handover/probe на `local` и очередь probe WB в тестах.
- Очередь команд шлюза, статусы accepted/queued/sent/confirmed/failed, запрет cloud MQTT execute.
- Агент: heartbeat, pull/ack, HTTP apply, MQTT publish+echo (фейк), буфер 5xx, local EVENT/SCHEDULE/critical (фейк).
- Кадр камеры: отказ без потока; ingest JPEG; пароль не в браузере.
- Backup пяти снимков, restore-гейт, `GET /api/health`.
- Production сайт отвечает health embedded; панель снимка в настройках админа (после деплоя этапа 9).

---

## Что выглядит готовым, но фактически не подтверждено

- Дом «на связи»: свет, климат 22,4 °C, улица 12,4 °C, камеры «На связи» — сид/`local`.
- Команды «Сделано» на демо-устройствах — LocalGatewayAdapter.
- MQTT «как на объекте» — только unit-тесты агента.
- Автоматизация «работает без интернета» — код агента, нет полевого прогона.
- Видеонаблюдение — JPEG-архитектура, не live и не железо.
- Оплата счетов — внутренний ledger.
- AI-помощник — шаблоны intent, не языковая модель.
- Расписание в облаке — только пока кто-то дергает status.
- Discovery устройств — очередь + кэш/файл, не live WB.
- Готовность «этапы 1–9 сделано» в TARGET — **софт**, не пилот.

---

## Что необходимо реализовать с нуля

- OTA агента.  
- Mutual TLS агента.  
- Live HLS/RTSP и архив видео.  
- Адаптеры modbus/knx/zigbee/matter/rs485 (сейчас stub).  
- Исполнение LIFE_MODE на агенте.  
- Durable cron облака (или сознательный отказ).  
- UI создания шлюза.  
- Playwright / E2E.  
- Prisma как SoT (отдельный проект).  
- Внешний банк и внешний GPT — если требуются продуктом (сейчас не обещаны кодом как реальные).  
- Инсталлятор агента (deb/compose) в репозитории нет.

Не требуется с нуля: PWA, RBAC, модель Device/Channel, канал шлюза, очередь, MQTT-клиент агента, JPEG-камеры, backup.

---

## Что проверить на физическом оборудовании

1. Установка агента, `STAR_HOME_CLOUD_URL=https://star-home.space`, токен из админки, MQTT только localhost.  
2. Heartbeat: ONLINE, version `agent-6`, mqtt `up`, bufferLag 0.  
3. Обрыв WAN 5+ мин: критическое правило протечки на LAN; после WAN — идемпотентный буфер, нет двойного publish.  
4. Discovery с брокера vs файл `STAR_HOME_WB_DISCOVERY`.  
5. Команда реле: UI → accepted → sent → confirmed только после значения на control topic.  
6. Таймаут: нет эха → failed, state не меняется, UI не «Сделано».  
7. Retained до publish не подтверждает команду.  
8. Телеметрия: изменение на контроллере видно в облаке (учесть интервал tick).  
9. Ворота: после исправления очереди — полный цикл с точки доступа жителя.  
10. Камера: HTTP snapshot и/или ONVIF GetSnapshotUri; RTSP без URL — честный отказ.  
11. Права: бухгалтер не кадр и не backup; соседний объект 404.  
12. Запрет echo/demo на объекте: команда без железа не confirmed.

---

*Конец отчёта. Код не изменялся. Исправления не начинались.*
