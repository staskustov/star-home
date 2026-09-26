# STAR HOME — Smart Home Architecture

Статус: **Phase 0. Аудит завершён. Код не писался. Ждём подтверждения.**

Модуль: **Smart Home Device Platform**.
STAR HOME Cloud — интерфейс, команды, состояние, уведомления, история, доступ, AI и API-шлюз.
Локальный контроллер — автоматизация. Облако не заменяет контроллер.

КП «Сияние» — первый объект данных. Ветки `if (project === "siyanie")` не будет.

Старый файл `STAR_HOME_ARCHITECTURE.md` описывает старт проекта «с нуля». Этот документ — аудит живой системы и план модуля умного дома поверх неё.

## 1. Что уже есть

Два процесса, один репозиторий:

| Слой | Где | Роль |
| --- | --- | --- |
| PWA | `apps/web` Next.js 16 | экраны жителя и админки |
| API | `apps/api` Nest, импорт `apps/web/src/server/rpc-handlers` | сессия, RBAC, запись |
| Истина | снимок `Snapshot` (JSON) | `catalog`, `people`, `ops`, `life`, `audit` |
| Проекция | Prisma / PostgreSQL | таблицы после ответа, не источник решений |
| Runtime | `STAR_HOME_RUNTIME=embedded` или RPC на `STAR_HOME_API_URL` | Vercel+Neon или локальный Nest |

Устройства уже живут в `ops` (`apps/web/src/server/ops-store.ts`):

```ts
Device = {
  id, companyId, objectId, unitId,
  kind, name,
  adapter: "local" | "http" | "matter" | "mqtt" | "modbus" | "onvif" | "rs485",
  endpoint?, work?: "ON" | "OFF" | "FAULT",
  latch?: "OPEN" | "CLOSED"
}
```

Виды: `GATE WICKET BARRIER LOCK CLIMATE HEATING LIGHTING CAMERA MOTION LEAK SMOKE FIRE POWER WATER IRRIGATION CURTAIN`.

Команды сейчас: `OPEN | CLOSE | READ`.
Адаптеры `matter/mqtt/modbus/onvif/rs485` — заглушки поверх HTTP.
Локальный адаптер подтверждает OPEN/CLOSE для ворот без железа; показания климата только из сохранённых `readings`, новые числа не выдумываются.

Точки доступа — те же `Device` с `isOpener`. CRUD есть у админа компании и объекта.

Комнат в данных нет. `/rooms` показывает зашитый список имён для `HOUSE`.
Планировки этажей уже есть на единице (`areaM2`, `floors`, `plans`) — картинки, без кнопок устройств.

Режимы жизни ровно три: `HOME / WORK / VACATION`. Переключение пишет режим единицы и не трогает устройства.

Realtime: WebSocket `/live` (Nest) или опрос `/api/live/pulse` раз в 20 с (embedded). Клиент — `LiveRefresh`. Вторая шина не нужна.

AI: инструменты `open_gate`, `create_pass`, `create_request`, `pay`, `switch_mode`. Состояние читает из стора. Опасное действие — только после `confirm`. Прямого MQTT нет.

Права `devices.view / command / create / edit / delete` уже в матрице. К RPC почти не подключены: команды идут через `access.*` и `engineering.*`. У жителя есть `devices.view`, нет `devices.command`.

## 2. Что переиспользуем

- Иерархия Company → Object → Building? → Unit → Membership.
- `can()` / `householdCan()` / `reaches()` / `placeFromSession`. Frontend не источник прав.
- Снимки и проекция. Живую Postgres не затираем, `withScale` не воскрешает удалённое.
- `Device` в `ops`, `DeviceAdapter`, `runDevice`, `removedDeviceIds`.
- Точки доступа и `access.gate.open`.
- Инженерия: опрос, `work`, группы систем.
- Журнал `AuditRecord`, `publishLive`, notices + Web Push.
- AI: intent → policy → confirm → tool.
- Экраны `/home`, `/rooms`, `/devices`, `/admin/devices`, `/admin/engineering`, `/admin/access`.
- Design system: `STAR_HOME_DESIGN_SYSTEM.md`.

## 3. Что добавляем — не ломая ядро

```
Resident / Admin / AI
        ↓
существующий RPC + RBAC
        ↓
Smart Home Service          (новое, рядом с operations.ts)
        ↓
Device Registry             (расширение Device в ops)
        ↓
Gateway Channel             (новое)
        ↓
STAR HOME Local Gateway     (на объекте, не в Cloud)
        ↓
DeviceAdapter               (Wiren Board — первый, не единственный)
        ↓
локальный контроллер / MQTT / устройство
```

Cloud не держит MQTT Wiren Board и не является контроллером автоматизации.

Новые сущности в снимках, не отдельные продукты:

| Сущность | Снимок | Зачем |
| --- | --- | --- |
| `Room` | `catalog` | помещение единицы, optional `floor` |
| `Gateway` | `ops` | локальный шлюз объекта / единицы |
| поля Device | `ops` | `gatewayId`, `roomId`, `externalId`, capabilities, availability |
| `Scenario` | `ops` | модель сценариев, без визуального редактора |
| `SmartHomeEvent` / history | `ops` | события и уплотнённая история |

Prisma-проекция — после стабилизации полей. Миграции схемы не блокируют Phase 1: новые поля живут в JSON снимка, как площадь дома и фамилия.

## 4. Границы

| Cloud делает | Cloud не делает |
| --- | --- |
| Показ состояния и «последнее известное» | Локальные сценарии термостата |
| Команды после authz | Прямой MQTT / Modbus / IP контроллера в браузер |
| Нормализация устройств | Подмена показаний |
| Аудит и уведомления | Обязательность для работы дома без интернета |

Житель видит: свет, климат, шторы, ворота, датчики, комнаты, сценарии, состояние дома.
Житель не видит: MQTT, topic, Modbus, device id, IP, регистры.

Технический специалист видит шлюзы, адаптеры, externalId, last seen, ошибки — в админке, не в PWA жителя.

## 5. Зависимости

- Существующий RPC (`rpc-handlers.ts` + `methodPolicy`).
- Каталог единиц (комнаты вешаются на `unitId`).
- Режимы жизни — три, сценарии их используют, четвёртый режим не появляется.
- Планировки домов — холст для будущей карты устройств, не в Phase 1–4.

## 6. Риски, если делать неправильно

1. Вторая таблица устройств рядом с `ops.devices` — разъедутся ворота и свет.
2. MQTT контроллера в интернет — запрещено правилом 3–4 ТЗ.
3. Команды жителя без `devices.command` на своей единице — экран будет мёртвым.
4. HIGH-команды (ворота, замки, клапаны) без confirm и аудита.
5. AI, который «угадывает» температуру.
6. Реализация только под Wiren Board.

## 7. Документы Phase 0

- `SMART_HOME_DATA_MODEL.md`
- `SMART_HOME_API_PLAN.md`
- `SMART_HOME_GATEWAY_ARCHITECTURE.md`
- `SMART_HOME_SECURITY_MODEL.md`
- `SMART_HOME_UI_PLAN.md`
- `SMART_HOME_IMPLEMENTATION_ROADMAP.md`

Код, UI, миграции и адаптер Wiren Board в этой фазе не делаются.
