# STAR HOME — Device API (Phase 0)

Тонкие HTTP-обёртки над RPC. Не плодим второй API-слой.

## Есть (`/api/smart-home`)

| Метод | Путь | Действие | Кто |
|-------|------|----------|-----|
| GET | `/devices` | карточки жителя | session + devices.view |
| POST | `/devices` | `registerDevice` | staff `devices.create` |
| GET | `/devices/:id` | карточка | scope |
| PATCH | `/devices/:id` | имя, place, room, gateway, capabilities | staff `devices.edit` |
| DELETE | `/devices/:id` | удалить | staff `devices.delete` |
| POST | `/devices/:id/command` | команда | devices.command / HIGH |
| POST | `/devices/:id/favorite` | избранное | житель |
| POST | `/devices/:id/place` | пин на плане, не комната | staff `devices.edit` |
| GET | `/rooms` | комнаты + сводка | житель |
| GET | `/rooms/:id/devices` | устройства комнаты | житель |
| GET | `/status` | климат, счётчики | житель |
| GET | `/events` | события | |
| GET | `/history?deviceId=` | ряд | |
| GET/POST | `/gateways` | реестр шлюзов | engineering / devices |
| POST | `/gateways/:id/pair\|rotate\|revoke` | токен | `devices.edit` |
| GET/POST | `/gateways/channel` | агент, заголовок токена | не session |

Нет `GET /objects/:objectId/devices` — список режется `reaches` на общем GET. Отдельный путь не обязателен.

Нет `GET /gateways/:id` — есть list + patch.

## Нет (ТЗ)

| Метод | Путь | Зачем |
|-------|------|--------|
| POST | `/devices/discover` | старт скана, `{ gatewayId }` → `{ scanId }` |
| GET | `/devices/discover/:scanId` | результат асинхронного скана |
| POST | `/devices/:id/test` | проверка каналов без полной команды; частично есть command + engineering poll |
| GET | `/devices/:id/channels` | если GET device не включит channels |
| PATCH | `/devices/:id/location` | дубль PATCH device; **не делать второй ресурс** |
| PATCH | `/devices/:id/channels/:channelId` | enable, displayName |
| GET | `/objects/:id/devices` | удобство админки; можно query `?place=OBJECT` на существующем GET |

## Контракт комнаты (цель)

`GET /rooms/:id/devices` уже есть. Расширить payload:

```
{ room, devices: [{ id, name, kind, availability, channels: [{ capability, displayName, value, unit, status }] }] }
```

Не N запросов на канал.

## Discovery contract (цель)

```
POST /discover { gatewayId } → { scanId, status: "pending" }
GET  /discover/:scanId     → { status: "pending"|"completed"|"error", devices: DiscoveredDevice[] }

DiscoveredDevice = {
  externalId, manufacturer?, model?, online,
  channels: [{ externalId, capability?, unit?, value? }],
  alreadyRegistered?: { deviceId, name }
}
```

Скан = gateway command + poll. Таймаут как у очереди (15 мин).

## Realtime

Не отдельный SSE на устройство. Тот же `emitLive` kind `device` после ingest канала. Клиент: WebSocket `/live` или pulse.

## Совместимость

Старые клиенты без channels: `state.temperatureC` остаётся. Новые поля additive.
