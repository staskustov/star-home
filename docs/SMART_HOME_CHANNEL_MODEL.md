# STAR HOME — Channel Model (Phase 0)

Сущности `DeviceChannel` в коде **нет**. Параметры — ключи `NormalizedState` и список `capabilities` на Device.

## Почему канал нужен

Физически WB-MSW3 — одно устройство. Логически у него несколько измерений. ТЗ запрещает Device на каждый параметр. Capability-список это уже выражает, но не даёт:

- unit (°C, %, lx, ppm) как metadata канала;
- включить / выключить канал без удаления Device;
- переименовать отображаемое имя («CO₂ гостиной»);
- readable / writable на параметр, не на весь kind;
- external channel id (`Temperature` vs `CO2`);
- last_value_at на канал (часть каналов жива, часть молчит → DEGRADED).

## Предлагаемая модель (снимок, не Prisma)

```
DeviceChannel = {
  id: string
  deviceId: string
  externalId: string          // «Temperature», control name на контроллере
  name: string                // нормализованный ключ / служебное
  displayName: string         // «Температура» — то, что видит админ/житель
  capability: Capability      // temperature, humidity, …
  unit: string                // °C, %, lx, ppm — не только во frontend
  dataType: "number" | "boolean" | "enum" | "string"
  readable: boolean
  writable: boolean
  value?: number | boolean | string | null
  min?: number
  max?: number
  precision?: number
  enabled: boolean            // админ выключил канал в визарде
  status: "LIVE" | "STALE" | "NONE" | "ERROR"
  lastValueAt?: string
  metadata?: Record<string, unknown>   // topic, register — только technical
}
```

Один Device → много Channel. UI жителя: **одна карточка датчика**, внутри значения включённых каналов.

`Device.state` остаётся кэшем для команд и старых экранов. При ingest канала нормализатор пишет и channel.value, и известные ключи state (`temperatureC` ← capability temperature).

## Нормализация

Адаптер (на шлюзе, не во frontend) приводит vendor-имя к capability + unit.

| Сырой канал | capability | unit |
|-------------|------------|------|
| Temperature / temp / T | temperature | °C |
| Humidity | humidity | % |
| Illuminance / Lux | illuminance | lx |
| CO2 / CO₂ | co2 | ppm |
| Pressure | pressure | hPa |
| Wind speed | wind | m/s |

Frontend не знает MQTT topic. Technical mode (staff + `engineering.view`) может показать `metadata.topic`.

## Команды

Writable канал не заменяет `smart-commands.ts`. Команда по-прежнему идёт в Device (`setPower`, `open`, …) и проверяется capability + RBAC. Канал с `writable: false` не рисует control.

`command_schema` в Phase 1 не обязателен: схема уже в `smart-commands.ts`. Добавим, когда появится нестандартный актуатор.

## История

`smartHistory` хранит точку с `deviceId + capability` в той же коллекции. Не переносим ряды в Postgres. Reconnect не интерполирует разрыв.

## Совместимость

Старые устройства без `channels`: при чтении синтезировать каналы из `capabilities` + `state`. Не писать синтетику в снимок на каждый GET.

## Что не делаем

- Channel как отдельный Device.
- REST на каждый канал с отдельным round-trip из комнаты: `GET room devices` возвращает devices + channels + latest values одним ответом.
- Хранение unit только в React-форматтерах.
