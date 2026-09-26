# STAR HOME — Smart Home Implementation Roadmap

Статус: **Phase 0–30 выполнены в этом круге.** Не коммитим, пока не попросите.

Не переписывали архитектуру. Не сидели живую Postgres. Не фейкали датчики и удалённый MQTT.

## Phase 0 — Аудит

Документы границ Cloud / local, модели, API, шлюза, security, UI.

## Phase 1 — Домен и реестр

Device / Gateway / Room, CRUD, HTTP `/api/smart-home/*` реестра, комнаты в Object Builder.

## Phase 2 — Gateway abstraction

- `GatewayAdapter`: local, http, wirenboard/mqtt
- Wiren Board — модуль, ядро без `if wirenboard`
- Нет брокера / не-localhost / OFFLINE → `confirmed: false`
- Тесты маппинга и offline

## Phase 3 — Smart Home API

- RPC/HTTP: status, devices, command, rooms, events, history
- Житель и семья: `devices.command` для LOW/MEDIUM
- HIGH: `access.gate.open` / `engineering.command` + confirm + audit
- События и history в `ops`

## Phase 4 — Realtime

- `publishLive` kind `device` / `gateway`, поля seq / at
- Тот же `LiveRefresh`
- Тесты seq: apply / duplicate / stale

## Phase 5 — Resident UI

- `/home` — плитки из реальных устройств, комнаты из каталога
- `/rooms` — каталог + счётчики
- `/devices` и `/devices/[id]` — карточка, stale честно, 1–2 касания

## Phase 6 — Technical Admin

- `/admin/devices`: шлюзы, last seen, ошибки, тест-команда
- Реестр и инженерия не дублируются третьим экраном

## Phase 7 — Сценарии

- Scenario + API, триггер MANUAL / LIFE_MODE
- Смена HOME / WORK / VACATION запускает LOW/MEDIUM
- HIGH в сценарии — тот же confirm; авторежим HIGH не исполняет
- «Ночь» не режим

## Phase 8 — AI tools

- Запросы из реальных данных
- control_device / set_temperature только с confirm
- HIGH не без confirm

## Phase 9 — Security audit

- Изоляция, command auth, AI bypass, invalid capability
- Отчёт: `SMART_HOME_SECURITY_AUDIT.md`

## Phase 10 — Документы ТЗ §33

- `SMART_HOME_WIREN_BOARD.md`
- `SMART_HOME_AI_TOOLS.md`
- `SMART_HOME_EVENTS.md`
- `SMART_HOME_SYNC.md`
- этот файл

## Phase 11 — План

- Пины только если у единицы есть `unit.plans` и у устройства `planFloor` / `planX` / `planY`
- Картинку плана не выдумываем
- Staff `devices.edit` ставит метку через `placeDevice`

## Phase 12 — История

- Список и простой SVG из `smartHistory`
- Точки не синтезируем

## Phase 13 — Быстрые действия

- На главной: выключить свет, закрыть шторы, «Ночь»
- «Ночь» — ручной сценарий `scen_night_24`, не четвёртый режим

## Phase 14 — Сценарии в UI

- `/scenarios`: список, запуск, создание MANUAL
- Те же RPC, что Phase 7

## Phase 15 — Канал шлюза

- Pair: токен один раз, в снимке только `sha256`
- Heartbeat и inbound state: заголовок `x-star-home-gateway`, без сессии жителя
- MQTT в интернет не открываем

## Phase 16 — Заглушки протоколов

- matter / modbus / knx / zigbee / onvif / rs485
- `confirmed: false`, пока адаптер не настроен

## Phase 17 — EVENT и SCHEDULE

- EVENT: все условия, HIGH пропускаем
- SCHEDULE: TZ объекта, `lastRunAt` = календарный день, один раз в сутки
- Команда из сценария не заново входит в EVENT

## Phase 18 — Плитки «Сейчас»

- Свет / двери / энергия / тревоги из реального state
- Пустых выдуманных плиток нет

## Phase 19 — Консоль техника

- `/admin/devices`: выдача токена, last seen, события, метка на плане
- Роль TECHNICAL_ADMIN не добавляли — нужна отдельная команда

## Phase 20 — Тесты и документы

- rbac / security / adapters
- этот файл

## Phase 21 — Карточки помещений

- `/rooms` — факты из реального state (климат / свет / шторы)
- `/rooms/[id]` — устройства помещения
- Пустые числа не выдумываем

## Phase 22 — Редактор сценариев

- MANUAL / EVENT / SCHEDULE, вкл/выкл, удаление
- HIGH по-прежнему не в автопрогоне

## Phase 23 — Очередь команд

- Не-local: `commandId`, статус QUEUED
- Шлюз pull/ack, повторный ack не применяет state
- Cloud не подтверждает за адаптер

## Phase 24 — Ротация токена

- `rotateGateway` / `revokeGateway`
- Старый токен сразу недействителен

## Phase 25 — Честный контроллер

- На главной баннер только если remote gateway stale / OFFLINE
- Local-only баннер не рисуем

## Phase 26 — Агент шлюза

- `apps/gateway/agent.ts`: heartbeat, pull, ack
- Сам не ставит `confirmed: true`

## Phase 27 — Уведомления

- Notice жильцам только при переходе в detected / FAULT
- Не чаще раза в 10 минут на тот же текст

## Phase 28 — Привязка к комнате

- Staff `updateDevice.roomId` с `/admin/devices`

## Phase 29 — История staff

- `smartHomeHistory` + `since`
- Staff до 200 точек, житель 80. Новых точек нет

## Phase 30 — Тесты и документы

- rbac / security / adapters
- этот файл

## Позже

- Интерактивная карта на планировке
- Полный Local Gateway binary / TLS
- Боевые Matter / Modbus / KNX / Zigbee
- Роль TECHNICAL_ADMIN при необходимости

## Явные отказы

- Cloud как контроллер автоматизации
- MQTT контроллера в интернет
- Protocol logic во frontend
- Права только в UI
- Четвёртый life mode
- Подмена показаний
- Перепись RBAC / сессии / каталога «с нуля»
