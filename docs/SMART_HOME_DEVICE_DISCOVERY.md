# STAR HOME — Device Discovery

Статус: **этап 2 сделан.** Скан через очередь шлюза. Автопривязки к комнате нет. Cloud MQTT не открывает.

## Как должно работать

1. Админ: Устройства → Добавить → Найти локальные устройства.
2. Cloud: `POST /api/smart-home/devices/discover { gatewayId }` → `scanId`.
3. Cloud кладёт команду скана в `gatewayCommands` (уже есть очередь).
4. Local Gateway pull-ит команду, спрашивает контроллер, отвечает `ack` + список.
5. `GET /api/smart-home/devices/discover/:scanId` → status + devices.
6. Админ выбирает устройство и **сам** назначает место. Автопривязки к комнате нет.

Найденное устройство без привязки: `DISCOVERED` / `UNCONFIGURED`. Не смешивать с ONLINE жителя.

## Wiren Board (первый адаптер)

Контроллер публикует `/devices/{id}/controls/{Control}`.  
Сейчас cloud маппит только `wb/{externalId}/{leaf}` и **не** ходит в брокер.

Правильное место парсинга WB — **Local Gateway**, не Vercel:

```
WB MQTT  →  gateway agent  →  normalized { externalId, channels[], online }
         →  channel POST kind=state | discover-result
         →  Device Registry
```

Cloud не получает raw topic в resident API. Cloud не открывает MQTT в интернет.

Маппинг эталона:

| Topic | Device.externalId | Channel | Capability | Unit |
|-------|-------------------|---------|------------|------|
| `/devices/wb-msw3/controls/Temperature` | wb-msw3 | Temperature | temperature | °C |
| `.../Humidity` | wb-msw3 | Humidity | humidity | % |
| `.../Illuminance` | wb-msw3 | Illuminance | illuminance | lx |
| `.../CO2` | wb-msw3 | CO2 | co2 | ppm |

Один physical id → один Device. Четыре control → четыре Channel.

Существующий `wirenboard.ts` (`wb/...`) оставляем как внутренний fallback / тесты. Native WB namespace добавляем в агент, не ломая cloud-запрет на удалённый брокер (`broker-forbidden` для не-localhost).

## Агент сегодня

`apps/gateway/agent.ts`: heartbeat, pull, ack всех команд `confirmed: false`, `error: agent-unapplied`. Нет MQTT, нет upload `kind: state`, нет discover.

Этап discovery расширяет агент: subscribe / list devices, нормализация, ответ на scan, периодический state. Cloud API скана — тонкая обёртка над очередью.

## Ручное добавление

Если скан пуст: имя, manufacturer, model, protocol, externalId, gateway, каналы из шаблона kind, место. Без обязательного ввода topic.

## Дубликаты

Ключ: `gatewayId + externalId`. Если запись есть — «Устройство уже добавлено» + ссылка открыть. Serial/model — дополнительные подсказки, не единственный ключ.

## Что не делаем в cloud

- MQTT subscribe из Next/Vercel.
- Автосоздание Device в комнате.
- Отдельный discover-микросервис.
