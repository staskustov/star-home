# STAR HOME — Smart Home Data Model

Статус: **Phase 0. Модель. Код не писался.**

Истина — JSON-снимки. Prisma — проекция. Живую базу не затираем.

Существующие Company, Object, Building, Unit, User, Membership, AuditLog, AccessEvent не дублируем.

## 1. Иерархия размещения

```
Company
  └── Object
        └── Building?          необязателен
              └── Unit         дом / квартира
                    └── Floor? необязателен (уже есть unit.floors + plans)
                          └── Room
                                └── Device
```

Коттедж: Object → Unit(HOUSE) → Floor? → Room → Device.
Квартира: Object → Building → Unit(APARTMENT) → Room → Device.
Объектная инфраструктура (ворота посёлка): Device.unitId = null, room опционален («Улица»).

`Floor` как отдельная сущность не обязателен. Этаж — поле комнаты `floor: number | null` и уже существующие планировки единицы.

## 2. Room — новое в catalog

Сейчас комнат нет. `home()` отдаёт зашитые имена для HOUSE.

```ts
CatalogRoom = {
  id: string;
  objectId: string;
  unitId: string;
  floor: number | null;     // 1..N или null
  name: string;             // «Гостиная», не технический id
  kind: "LIVING" | "BEDROOM" | "KITCHEN" | "STUDY" | "BOILER" | "BATH" | "HALL" | "TERRACE" | "STREET" | "OTHER";
  sort: number;
}
```

Права: `objects.structure.edit` (как дома и корпуса).
Удаление комнаты с устройствами — 409, сначала снять привязку.

## 3. Gateway — новое в ops

```ts
Gateway = {
  id: string;
  companyId: string;
  objectId: string;
  unitId: string | null;     // null = шлюз объекта
  name: string;              // «WB Local Gateway»
  adapter: "wirenboard" | "mqtt" | "modbus" | "matter" | "http" | "knx" | "onvif" | "local";
  status: "ONLINE" | "OFFLINE" | "DEGRADED";
  version: string | null;
  lastSeen: string | null;   // ISO
  lastError: string | null;  // только технический UI
  internalAddress: string | null; // не отдавать жителю
  metadata: Record<string, unknown>;
}
```

Один объект может иметь несколько шлюзов. Устройство ссылается на один `gatewayId` или на `null` (локальный/демо адаптер, как сейчас).

## 4. Device — расширение существующей записи

Не заводим вторую коллекцию устройств. Расширяем `ops.devices`.

Текущие поля оставляем. Добавляем:

```ts
// уже есть
id, companyId, objectId, unitId, kind, name, adapter, endpoint?, work?, latch?

// добавляем
displayName?: string;
gatewayId?: string | null;
roomId?: string | null;
externalId?: string | null;     // id на контроллере, не имя в UI
manufacturer?: string | null;
model?: string | null;
capabilities: Capability[];     // пусто = вывести из kind (совместимость)
availability: "ONLINE" | "OFFLINE" | "UNKNOWN";
lastSeen?: string | null;
state?: NormalizedState;        // кэш последнего подтверждённого состояния
updatedAt?: string;
metadata?: Record<string, unknown>;
```

`externalId` и `id` никогда не показываются жителю как имя.
`name` / `displayName` — человеческое имя («Свет в гостиной»).

Виды не ограничиваем текущим списком. Новые коды допустимы; неизвестный kind в UI = «Устройство» + capabilities.

Совместимость seed: старые записи без новых полей нормализуются при чтении (`availability: UNKNOWN`, `capabilities` из kind, `gatewayId: null`).

## 5. Capabilities и состояние

UI строится на capability, не на производителе.

| Capability | Команды | Состояние |
| --- | --- | --- |
| `power` | `setPower` | `on: boolean` |
| `brightness` | `setBrightness` | `brightness: 0..100` |
| `temperature` | — (датчик) | `temperatureC` |
| `humidity` | — | `humidityPercent` |
| `thermostat` | `setTemperature`, `setHvacMode` | `currentC`, `targetC`, `mode` |
| `position` | `setPosition`, `open`, `close`, `stop` | `position: 0..100` |
| `latch` | `open`, `close` | `OPEN` / `CLOSED` |
| `motion` | — | `detected: boolean` |
| `leak` | — | `detected: boolean` |
| `smoke` | — | `detected: boolean` |
| `contact` | — | `open: boolean` |
| `energy` | — | `watts?`, `kwh?` |

`NormalizedState` — плоский объект известных ключей. Неизвестный ключ адаптера жителю не показывается.

Текущие `work` и `latch` остаются. `work: FAULT` = проблема. `availability: OFFLINE` = «Устройство недоступно», не «MQTT timeout».

## 6. Scenario

Только backend-модель в Phase 7. Визуальный редактор не в первом круге.

```ts
Scenario = {
  id, companyId, objectId, unitId?: string | null,
  name, description,
  trigger: "MANUAL" | "LIFE_MODE" | "EVENT" | "SCHEDULE",
  lifeMode?: "HOME" | "WORK" | "VACATION",
  conditions: unknown[],
  actions: { deviceId, command, value, risk }[],
  enabled: boolean,
  createdBy: string,
}
```

Триггер `LIFE_MODE` связывается с существующим `setUnitMode`. Четвёртый режим не появляется.
«Ночной режим» — сценарий или быстрое действие внутри `HOME`, не четвёртый Life Mode.

Опасные действия в сценарии требуют тех же permission / confirm, что ручная команда.

## 7. События и история

```ts
SmartHomeEvent = {
  id, at,
  companyId, objectId, unitId, roomId?, deviceId?, gatewayId?,
  kind: "STATE" | "COMMAND" | "ALERT" | "AVAILABILITY" | "GATEWAY",
  title: string,           // «Дверь открыта», не topic
  severity: "INFO" | "WARNING" | "ALERT",
  payload: Record<string, unknown>,
  source: "USER" | "GATEWAY" | "SCENARIO" | "AI" | "SYSTEM",
}
```

История для графиков — отдельные уплотнённые ряды, не бесконечный raw MQTT.

| Слой | Что | Срок |
| --- | --- | --- |
| hot | текущее состояние Device.state | всегда |
| events | важные события | 90 дней в снимке, дальше обрезка |
| series | температура, влажность, энергия, шаг ≥ 5 мин | 30 дней hot, далее downsample |

`DeviceReading` (temperatureC/humidityPercent) остаётся и становится одним из рядов.

## 8. Команда (журнал исполнения)

```ts
DeviceCommandLog = {
  id, at,
  actorUserId, source: "APP" | "ADMIN" | "AI" | "SCENARIO",
  deviceId, command, value,
  risk: "LOW" | "MEDIUM" | "HIGH",
  result: "SUCCESS" | "DENIED" | "ERROR" | "UNCONFIRMED",
  reason?: string,
}
```

Дублирует смысл аудита для HIGH. HIGH всегда ещё и `AuditRecord` (`ENGINEERING` или `ACCESS`).

## 9. Prisma (позже, не блокирует Phase 1)

Сейчас:

```
Device(id, companyId, objectId, unitId, kind, name, adapter)
DeviceState(deviceId, state, temperatureC, humidityPercent)
Automation / LifeModeSetting / LifeModeActive
```

После стабилизации модели проецируем: Room, Gateway, расширенный Device, Event. `endpoint`, `work`, `latch`, capabilities в проекции сегодня нет — это нормально, снимок полнее таблицы.

Не создавать параллельные Prisma-модели как источник истины.

## 10. Изоляция

Каждое устройство несёт `companyId` + `objectId` + optional `unitId`.
`reaches(actor, device)` уже есть. Сохраняем: знание `deviceId` не даёт доступ к чужому дому. Чужая компания — 404, своя вне scope — 403.
