# STAR HOME — Device Model (Phase 0)

Не создаём вторую сущность Device. Расширяем `ops.devices`.

## Сейчас (код)

Источник: `apps/web/src/server/ops-store.ts`, проекция `apps/api/prisma/schema.prisma`.

### Snapshot Device

```
id
companyId          обязательно
objectId           обязательно
unitId             null = объект / улица
place              OBJECT | STREET | ROOM     (нормализуется)
kind               DeviceKind
name
adapter            local | http | matter | mqtt | modbus | onvif | rs485
endpoint?
work               ON | OFF | FAULT
latch              OPEN | CLOSED
displayName?
gatewayId?
roomId?
externalId?        id на контроллере
manufacturer?
model?
capabilities[]     из kind, если пусто
availability       ONLINE | OFFLINE | UNKNOWN
lastSeen?
state              NormalizedState (плоский кэш)
updatedAt?
planFloor / planX / planY
metadata?
```

### Prisma Device (проекция)

```
id, companyId, objectId, unitId, kind, name, adapter
```

`DeviceState`: `state` (текст), `temperatureC`, `humidityPercent`.  
`gatewayId`, `roomId`, `place`, `capabilities`, `state`, `lastSeen` в Prisma **нет**. Это нормально: снимок полнее таблицы.

### DeviceKind

GATE, WICKET, BARRIER, LOCK, CLIMATE, HEATING, LIGHTING, CAMERA, MOTION, LEAK, SMOKE, FIRE, POWER, WATER, IRRIGATION, CURTAIN, WEATHER.

Неизвестный kind в UI = «Устройство» + capabilities. Новые коды допустимы.

### NormalizedState (плоско, не каналы)

`on`, `brightness`, `temperatureC`, `humidityPercent`, `targetC`, `mode`, `position`, `latch`, `detected`, `watts`, `kwh`, `windMs`, `radiationUSv`.

Illuminance, CO2, voltage, pressure, flow в state **нет**.

## Что добавить в тот же Device (после подтверждения)

Без новой таблицы. Поля в снимке:

| Поле | Зачем |
|------|--------|
| `serialNumber?` | Дубликаты вместе с gateway + externalId |
| `protocol?` | Человеческий протокол. `adapter` остаётся транспортом шлюза |
| `status` | Жизненный цикл ТЗ. Не путать с `availability` |
| `channels?` | Список `DeviceChannel`. Пусто = вывести из capabilities (совместимость) |
| `physicalId?` | Только если контроллер отдаёт отдельно от `externalId` |

### Жизненный цикл (предложение)

| status | Когда |
|--------|--------|
| `DISCOVERED` | Шлюз прислал, в реестре ещё нет карточки привязки |
| `UNCONFIGURED` | Запись есть, место / каналы не подтверждены админом |
| `ONLINE` | Привязано и есть свежий lastSeen |
| `OFFLINE` | Привязано, нет связи |
| `DEGRADED` | Часть каналов молчит или work=FAULT |
| `ERROR` | lastError / отказ адаптера |
| `DISABLED` | Админ выключил. История не удаляется |
| `REMOVED` | Скрыто из реестра, history остаётся |

`availability` оставляем как быстрый флаг связи. `status` — административный lifecycle. Пока код пишет только `availability`.

## Что не добавляем

- `buildingId`, `floorId` на Device — здание из `Unit.buildingId`, этаж из `Room.floor`.
- Отдельную таблицу DeviceLocation.
- Prisma-миграцию как условие Phase 1.
- `roomId` обязательным: object/street устройства остаются без комнаты.

## Регистрация сегодня

`registerDevice` (`devices.create`): object scope, kind, `bindPlace`, gateway, manufacturer/model/externalId, capabilities.  
`adapter` при создании = `local`. `availability` = `UNKNOWN`.  
Дом без `roomId` → 400 «Если устройство в доме, выберите помещение или улицу дома».  
STREET / OBJECT обнуляют `unitId` и `roomId` (в т.ч. WEATHER).

Перепривязка: `updateDevice` (`devices.edit`) меняет place/unit/room. История (`smartHistory` по deviceId) не сбрасывается. Это уже соответствует ТЗ §25.

Удаление: `removeDevice` (`devices.delete`). История в снимке не cascade-delete отдельным store — точки остаются, пока их не обрежет retention. Явного `DISABLED`/`REMOVED` нет.

## Дубликаты сегодня

Нет уникального ключа `gatewayId + externalId`. Повторный register создаст вторую запись. Это закрываем в этапе модели.
