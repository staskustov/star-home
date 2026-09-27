# STAR HOME — Capabilities (Phase 0)

UI и команды строятся на capability, не на manufacturer / MQTT topic / модели.

## Есть в коде

`apps/web/src/server/device-capabilities.ts`:

```
power, brightness, temperature, humidity, thermostat,
position, latch, motion, leak, smoke, contact, energy,
wind, radiation
```

Дефолты по kind: CLIMATE → temperature+humidity+thermostat; WEATHER → temperature+humidity+wind+radiation; GATE/WICKET/BARRIER/LOCK → latch; LIGHTING → power+brightness.

Команды: `apps/web/src/server/smart-commands.ts` — `deviceCan(capability)`, не флаги канала.

Единицы во frontend: `formatTemperature`, `formatHumidity`. В metadata устройства unit **не хранится**.

## Нет, а ТЗ просит

illuminance, co2, co, voc, pressure, presence, door, window, gas, voltage, current, frequency, water_flow, water_pressure, water_level, soil_moisture, wind_direction, rain, uv.

Часть перекрывается: `contact` ≈ door/window; `detected` на leak/smoke/motion; `wind` без direction; `energy` без voltage/current.

## Каталог после подтверждения

Расширяем union `Capability`. Неизвестный capability из шлюза не роняет ingest: кладётся в `metadata`, жителю не показывается.

| capability | unit по умолчанию | UI |
|------------|-------------------|-----|
| temperature | °C | число |
| humidity | % | число |
| illuminance | lx | число |
| co2 | ppm | число |
| pressure | hPa | число |
| wind | m/s | число |
| radiation | µSv/h | число |
| energy | kWh | число + power W |
| latch | — | Открыто / Закрыто |
| power | — | Вкл / Выкл |
| brightness | % | слайдер |
| position | % | слайдер |
| motion / leak / smoke / contact | — | да / нет |
| thermostat | °C | setpoint + mode |

## Capability-driven UI (цель)

Карточка выбирается по набору capabilities устройства, не по «WB-MSW3»:

- есть temperature+humidity+co2+illuminance → климатический блок;
- есть latch → кнопка доступа;
- есть power → выключатель.

Житель не видит raw id. Staff + `engineering.view` видит adapter, externalId, topic в technical.

## AI

AI читает каналы только через server: `get_room_climate`, `get_device_channels`. Нет `get_mqtt`. Команды — `commandDeviceSmart`.
