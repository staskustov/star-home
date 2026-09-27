# STAR HOME — Device Registry (Phase 0)

Статус: **аудит. Код не писался.**  
Истина устройств — JSON-снимок `ops`, не Prisma. Prisma `Device` — узкая проекция. Живую базу не затираем. Вторую коллекцию устройств не создаём.

## Зачем реестр

Администратор связывает **физическое** устройство локального контроллера с **логическим** местом в STAR HOME: объект / дом / помещение. Житель видит человеческие параметры помещения, не MQTT topic.

STAR HOME не становится физическим контроллером. Local Gateway (Wiren Board и другие) читает датчики. Cloud хранит идентификацию, структуру, привязку, права, историю, сценарии и отдаёт команды только если устройство writable.

## Что уже есть

| Слой | Где | Состояние |
|------|-----|-----------|
| Device | `ops.devices` | Одна запись на физическое устройство. `kind`, `capabilities[]`, плоский `state` |
| Gateway | `ops.gateways` | CRUD, pair / rotate / revoke, канал heartbeat / pull / ack / state |
| Room | `catalog.rooms` | CRUD, `objects.structure.edit`. Этаж — поле, не сущность |
| Привязка | `Device.place` + `unitId` + `roomId` | `OBJECT` / `STREET` / `ROOM`. Дом без комнаты — 400 |
| HTTP | `/api/smart-home/devices*` | GET/POST/PATCH/DELETE, command, favorite, plan pin |
| Admin UI | `/admin/devices` | Список, bind OBJECT/STREET/ROOM, шлюзы, тест-команда |
| Resident | `/rooms`, `/rooms/[id]`, `/devices` | Карточка устройства, не topic |
| Realtime | `/api/live` + pulse | WebSocket или `router.refresh` |
| History | `ops.smartHistory` | 30 дней, шаг ≥ 5 мин, не отдельный time-series store |
| RBAC | `devices.*`, `engineering.*` | Backend SoT. Житель не создаёт и не перепривязывает |

## Чего нет (разрыв с ТЗ)

1. **DeviceChannel** — параметры живут в плоском `NormalizedState` и `capabilities[]`, не как отдельные каналы с unit / readable / writable.
2. **Discovery** — нет `POST /discover`, нет `UNCONFIGURED`, нет скана шлюза.
3. **Wiren Board MQTT** — маппинг `wb/{id}/{leaf}` в cloud. Нет клиента и нет `/devices/.../controls/...`. Агент `apps/gateway` все команды помечает `confirmed: false`.
4. **Визард «Добавить устройство»** — на `/admin/devices` и в Object Builder у помещения.
5. **Жизненный цикл** ТЗ (`DISCOVERED` → `UNCONFIGURED` → `ONLINE`…). Сейчас `availability`: ONLINE / OFFLINE / UNKNOWN.
6. **Инженерная зона / ЛОС** как сущность. Есть `kind` POWER/WATER, `room.kind` BOILER, object-level `unitId: null`.
7. **AI** не ходит в каналы: `rooms` отдаёт имена каталога, не климат помещения.

## Правило «одно физическое = много каналов»

Уже соблюдается на уровне Device: CLIMATE — одно устройство с temperature + humidity + thermostat, не три Device.  
Не соблюдается на уровне Channel: нет отдельной сущности канала, нет unit в metadata канала, нет выборочного включения канала админом.

Эталон после реализации:

```
WB-MSW3  →  Device «Климатический датчик»
              place = ROOM, unit = Дом №24, room = Гостиная
              channels: temperature °C, humidity %, illuminance lx, co2 ppm
Resident: Гостиная → 22.4 °C · 48 % · 320 lx · 650 ppm
```

## Источник истины

- Registry, channels, last state, events, history — **снимок `ops`**.
- Каталог мест — **снимок `catalog`**.
- Prisma — проекция подмножества. Миграции Prisma **не нужны** для Phase 1 каналов.
- Cloud не подписывается на MQTT в интернет. Discovery и сырые topic остаются на Local Gateway.

## Документы круга

| Файл | Содержание |
|------|------------|
| [SMART_HOME_DEVICE_MODEL.md](./SMART_HOME_DEVICE_MODEL.md) | Device: есть / расширить |
| [SMART_HOME_CHANNEL_MODEL.md](./SMART_HOME_CHANNEL_MODEL.md) | Новая сущность Channel |
| [SMART_HOME_CAPABILITIES.md](./SMART_HOME_CAPABILITIES.md) | Каталог capability + единицы |
| [SMART_HOME_DEVICE_DISCOVERY.md](./SMART_HOME_DEVICE_DISCOVERY.md) | Скан шлюза, без автопривязки |
| [SMART_HOME_DEVICE_LOCATION.md](./SMART_HOME_DEVICE_LOCATION.md) | OBJECT / STREET / ROOM |
| [SMART_HOME_DEVICE_API.md](./SMART_HOME_DEVICE_API.md) | Существующие и недостающие API |
| [SMART_HOME_DEVICE_SECURITY.md](./SMART_HOME_DEVICE_SECURITY.md) | RBAC, изоляция, риски |
| [SMART_HOME_DEVICE_IMPLEMENTATION.md](./SMART_HOME_DEVICE_IMPLEMENTATION.md) | Этапы после подтверждения |
