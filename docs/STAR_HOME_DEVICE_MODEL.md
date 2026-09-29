# STAR HOME — модель устройств (как в коде)

Дата: 2026-09-28  
SoT: JSON-снимок `ops` (и `catalog` для помещений). Prisma Device — проекция, UI её не читает.

## Иерархия места

| ТЗ | Поле | Обязательность |
|----|------|----------------|
| Project | `catalog` Object | да |
| Building | Building | внутри объекта |
| Unit | Unit | квартира / дом |
| Room | Room | для `place: ROOM` |
| Gateway | `ops.gateways` | объект может иметь несколько |
| Device | `ops.devices` | `roomId` может быть null |
| Channel | `devices[].channels` | одно устройство — много каналов |

Место устройства: `OBJECT` | `STREET` | `ROOM`.

## Идентификаторы

- Внутренний `id` стабилен (`dev_…`).
- Железо: пара `gatewayId` + `externalId` уникальна (`findDuplicateDevice`).
- Житель не видит `externalId` / MQTT topic в карточках.

## Адаптер

`device.adapter` = `gateway.adapter` при register/bind.

Допустимые виды шлюза: `wirenboard`, `mqtt`, `modbus`, `matter`, `http`, `knx`, `onvif`, `zigbee`, `rs485`, `local`.

Демо-сид: `metadata.demo: true`. Устройства без шлюза с `adapter: local` — явный демо-контур жителя.

Новая регистрация: `metadata.handedOver: false` — житель не видит устройство, пока специалист не передаст после успешной проверки. Поле отсутствует (сид/прод) — устройство видимо по прежним правилам. `lastProbeAt` / `lastProbeMs` / `lastProbeResult` — тоже в JSON metadata.

## Канал и качество

Значение: `number | boolean | string | null`. Пустое **не** превращается в `0`.

`quality`: `fresh` | `stale` | `unavailable` | `unknown` | `error`  
(рядом со статусом `LIVE` / `STALE` / `NONE` / `ERROR`).

UI жителя строится по `capabilities`, не по модели производителя.

## Команда и телеметрия

См. `docs/STAR_HOME_COMMAND_LIFECYCLE.md`. Текущие значения — каналы + проекция `device.state`. История: `smartHistory`.
