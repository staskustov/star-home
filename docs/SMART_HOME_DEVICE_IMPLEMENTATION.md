# STAR HOME — Device Registry Implementation (Phase 0)

Код этого круга **не пишем**, пока нет подтверждения этапа 1.

Не дублируем Device, Room, Gateway. Не делаем Prisma SoT. Не подписываем cloud на MQTT. Не трогаем resident app без нужды. Не сидим живую Postgres.

Старые файлы в корне (`SMART_HOME_DATA_MODEL.md`, roadmap Phase 0–52) описывают **уже сделанный** контур. Этот документ — **следующий** круг: каналы, discovery, админ-визард.

## Уже достигнуто (не переделывать)

- Реестр Device + Gateway в `ops`
- Комнаты в catalog, CRUD, «Улица» у каждого дома
- Привязка OBJECT / STREET / ROOM
- HTTP `/api/smart-home/devices*`
- `/admin/devices` bind + шлюзы
- Житель `/rooms`, `/rooms/[id]` — одно устройство = одна карточка
- Capabilities, команды, сценарии, AI confirm
- Live + history + command journal + RBAC

## Главный разрыв

Админ **не может** найти физический WB-MSW3, разобрать его на каналы и повесить на Гостиную так, чтобы житель увидел 22.4 °C / 48 % / 320 lx / 650 ppm **как один датчик с несколькими параметрами**.

## Этапы (сжато относительно ТЗ §71)

Каждый этап: код → тесты → стоп → подтверждение. Коммит/деплой только по просьбе.

### Этап 1 — Модель каналов

Статус: **сделано.** Снимок `ops.devices`: `channels[]`, `status`, `serialNumber`. Синтез на чтении, запись только при persist. Уникальность `gatewayId+externalId` → 409.  
**Нет UI визарда. Нет MQTT.**

### Этап 2 — Discovery на шлюзе

Статус: **сделано.** `POST /api/smart-home/devices/discover` → очередь `discover` → агент отвечает ack + список. Native topic `/devices/.../controls/...`. Автопривязки к комнате нет. Cloud MQTT не открывает.

### Этап 3 — Админ: визард и карточка

Статус: **сделано.** `/admin/devices` + визард «Добавить» (поиск / вручную → место → каналы → проверка). Карточка `/admin/devices/[id]`: привязка, каналы, technical. Фильтры Все / На связи / Нет связи / Без настройки / Объект / Дом. Второго меню нет.

### Этап 4 — Комната и житель

Статус: **сделано.** Object Builder: устройства помещения + «Добавить устройство». Житель `/rooms/[id]`: одна карточка, несколько каналов, без topic. Object-level POWER/WATER/HEAT и `metadata.engineering` скрыты от жителя; ворота и погода остаются.

### Этап 5 — Live и история каналов

Статус: **сделано.** Ingest (`kind: state`) пишет `channel.value` + `state`, `emitLive` kind `device`. History в том же `smartHistory` с `capability`. Offline шлюза → устройства OFFLINE, каналы STALE, значения остаются. Reconnect не рисует точки в разрыве.

### Этап 6 — Команды, AI, security

Статус: **сделано.** Writable-канал → существующие `smart-commands` + RBAC; `writable: false` не рисует команду. AI `get_room_climate` / `get_device_channels` только server, без MQTT. Audit: discover, channel_changed, пин плана. Отчёт — `SMART_HOME_DEVICE_SECURITY.md`.

## Prisma / migrations

Этап 1: **миграций нет.** Поля в JSON снимка.  
Позже (не блокер): проекция Room / Gateway / лишних колонок Device, если понадобится отчётность.

## UI страницы

| Нужно | Решение |
|-------|---------|
| `/admin/smart-home/devices` | Не плодить. Расширить `/admin/devices` |
| `/admin/smart-home/devices/:id` | `/admin/devices` + панель/маршрут детали под тем же разделом |
| Комната в админке | `/admin/objects/[id]` unit rooms + список устройств |
| Общие устройства объекта | фильтр place=OBJECT на `/admin/devices` и инженерия |
| Визард | модал/поток на `/admin/devices` |

Навигация: Системы → Устройства. Подпункты «Обзор / Дома / Gateway» — табы на той же странице, не новое дерево.

## Оценка объёма относительно ТЗ

| ТЗ phase | Наш этап | Комментарий |
|----------|----------|-------------|
| 0 audit | 0 | этот круг |
| 1 data model | 1 | snapshot, не Prisma |
| 2 discovery | 2 | агент + очередь |
| 3 admin devices | 3 | |
| 4 room admin | 4 | |
| 5 realtime/history | 5 | слой уже есть, расширяем |
| 6 resident | 4 | раньше: иначе нечем проверить эталон |
| 7 commands | 6 | почти готово |
| 8 AI | 6 | |
| 9 security | 6 | |

## Стоп

Дальше — только после явного «делай этап 1».
