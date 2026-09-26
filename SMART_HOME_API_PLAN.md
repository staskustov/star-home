# STAR HOME — Smart Home API Plan

Статус: **Phase 0. План API. Код не писался.**

Новый транспорт не вводим. Те же JSON-RPC методы + тонкие `app/api/*` обёртки.

Frontend не знает MQTT topic, adapter и IP.

## 1. Как устроен API сейчас

`dispatch` → `methodPolicy` → `staffActor` / `household` → домен.
Нет записи в `methodPolicy` — отказ.
Права считаются на сервере. `objectId` / `deviceId` из тела — только цель, не доказательство.

Уже есть:

| Метод | Право | Что делает |
| --- | --- | --- |
| `home` | session + place | климат, устройства read-only, зашитые rooms |
| `openGate` / `openPoint` | `access.gate.open` | OPEN opener |
| `openObjectPoint` / `closeObjectPoint` | `access.gate.open` | staff |
| `createAccessPoint` … | `access.points.manage` | CRUD ворот |
| `engineering` / `pollDevice` / `setDeviceWork` | engineering.* | опрос и work |
| `desk` section `devices` | `devices.view` | список |
| `ask` / `confirm` | `ai.use` | инструменты |

Не подключены к RPC: `devices.command`, `devices.create`, `devices.edit`, `devices.delete`.

## 2. HTTP-поверхность (обёртки)

Как просил ТЗ, плюс соответствие текущему стилю `/api/...` → RPC.

Житель / общий:

```
GET  /api/smart-home/status
GET  /api/smart-home/devices
GET  /api/smart-home/devices/:id
POST /api/smart-home/devices/:id/command
GET  /api/smart-home/rooms
GET  /api/smart-home/rooms/:id/devices
GET  /api/smart-home/events
GET  /api/smart-home/history
```

Админ / техника (те же RPC, другие права):

```
GET    /api/smart-home/gateways
POST   /api/smart-home/gateways
PATCH  /api/smart-home/gateways/:id
GET    /api/smart-home/gateways/:id
POST   /api/catalog/units/:id/rooms
PATCH  /api/catalog/rooms/:id
DELETE /api/catalog/rooms/:id
```

Ворота по-прежнему `/api/access/*`. Не дублировать OPEN ворот вторым «умным» путём без той же проверки `access.gate.open`.

## 3. RPC, которые добавим (Phase 3+)

| Метод | Кто | Право | Назначение |
| --- | --- | --- | --- |
| `smartHomeStatus` | household / staff | `devices.view` | сводка дома |
| `smartHomeDevices` | household / staff | `devices.view` | список в scope |
| `smartHomeDevice` | household / staff | `devices.view` | карточка |
| `commandDeviceSmart` | household / staff | см. риск | команда |
| `smartHomeRooms` | household / staff | `devices.view` или `home.view` | комнаты единицы |
| `smartHomeEvents` | household / staff | `devices.view` | лента |
| `smartHomeHistory` | household / staff | `devices.view` | ряды для графиков |
| `listGateways` | staff | `engineering.view` | шлюзы |
| `saveGateway` | staff | `devices.create` / `engineering.edit` | реестр шлюза |
| `roomsSave` / `roomsRemove` | staff | `objects.structure.edit` | комнаты |
| `devicesRegister` / `devicesUpdate` / `devicesRemove` | staff | `devices.create/edit/delete` | реестр |

Имена уточним при реализации, политика — в `methodPolicy`.

## 4. Команда

```json
POST /api/smart-home/devices/:id/command
{ "command": "setPower", "value": true }
```

Другие: `setBrightness` 0–100, `setTemperature` °C, `setHvacMode`, `setPosition`, `open`, `close`, `stop`.

Сервер:

1. сессия
2. устройство существует
3. `reaches(actor, device)` — company / object / unit
4. capability есть у устройства
5. право по уровню риска
6. HIGH — confirm token (как AI / ворота)
7. адаптер / шлюз
8. `confirmed === true` иначе честный отказ
9. аудит + live-событие

Frontend не выбирает gateway и protocol.

## 5. Ответы жителю

Список устройств — человеческие поля:

```ts
{
  id, name, typeLabel, roomName,
  availability,           // ONLINE | OFFLINE | UNKNOWN
  stale: boolean,         // связь потеряна
  lastSeen,               // «23:41», не скрывать если stale
  capabilities, state,    // только известные
  canCommand: boolean     // подсказка UI, сервер всё равно проверяет
}
```

Нет: `externalId`, `endpoint`, `adapter`, `internalAddress`, raw topic.
Технический desk отдаёт эти поля отдельно, по `engineering.view`.

Офлайн шлюза:

```
status: "CONTROLLER_UNAVAILABLE"
message: "Контроллер недоступен."
lastSeen: "23:41"
```

Устаревшее состояние не выдавать как актуальное (`stale: true`).

## 6. Realtime

Новые `publishLive` kind: `device`, `gateway`, `smarthome`.
Клиент уже делает `router.refresh()` на любое сообщение / смену pulse.
Отдельный SSE и вторая WS-шина не создаём.

## 7. AI tools (Phase 8)

Расширить существующий `ai-intent.ts`, не новый движок:

- `get_home_status`
- `get_rooms` / `get_devices` / `get_device_status`
- `control_device` — LOW/MEDIUM, HIGH только через confirm
- `set_temperature`
- `get_security_status` / `get_open_doors` / `get_active_alerts`
- `get_energy_status`

AI не ходит в MQTT. Нет данных — «нет показаний», не выдумка.

## 8. Тесты API (обязательные)

Существующий стиль: `apps/api/test/rbac.test.ts`, `security.test.ts`.

- житель A не командует устройством жителя B, даже зная id
- object admin объекта X не видит шлюз объекта Y
- менеджер не создаёт gateway, если нет права
- HIGH без confirm — отказ
- неизвестная capability — 400
- OFFLINE — команда не «успех»
- AI tool без `ai.use` / без confirm — отказ
- изоляция company 404 / scope 403
