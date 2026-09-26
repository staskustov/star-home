# STAR HOME — Smart Home Implementation Roadmap

Статус: **Phase 0–10 выполнены в этом круге.** Не коммитим, пока не попросите.

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

## Позже

- Интерактивная карта на планировке
- Полный Local Gateway binary
- Matter / Modbus / KNX / Zigbee
- Графики history
- Роль TECHNICAL_ADMIN при необходимости

## Явные отказы

- Cloud как контроллер автоматизации
- MQTT контроллера в интернет
- Protocol logic во frontend
- Права только в UI
- Четвёртый life mode
- Подмена показаний
- Перепись RBAC / сессии / каталога «с нуля»
